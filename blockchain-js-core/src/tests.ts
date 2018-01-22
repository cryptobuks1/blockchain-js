import * as Block from './block'
import * as NodeApi from './node-api'
import * as NodeImpl from './node-impl'
import * as NodeTransfer from './node-transfer'
import * as NodeNetworkClient from './node-network-client'
import * as NodeNetworkServer from './node-network-server'
import * as TestTools from './test-tools'
import * as Tools from './tools'
import * as ListOnChain from './list-on-chain'
import * as MinerImpl from './miner-impl'
import * as NetworkApiNodeImpl from './network-api-node-impl'

import * as express from 'express'
import * as bodyParser from 'body-parser'
import * as WebSocket from 'ws'

const NETWORK_CLIENT_API = new NetworkApiNodeImpl.NetworkApiNodeImpl()

async function testDataSerialization() {
    let t1 = [false, null, { toto: 5, aa: 'titi' }, false, true, 5, 'toto', { 'none': false }]
    let t1ser = Block.serializeBlockData(t1)
    console.log(`${JSON.stringify(JSON.parse(t1ser))}`)
}

async function testBasicMining() {
    console.log(`creating a node`)
    let node = new NodeImpl.NodeImpl('original')
    node.addEventListener('head', async () => console.log(`event : node has new head (${await node.blockChainHead(Block.MASTER_BRANCH)})`))

    console.log(`current head: ${await node.blockChainHead(Block.MASTER_BRANCH)}`)
    let miner = TestTools.createSimpleMiner(Block.MASTER_BRANCH, null, 10)

    let nbToMine = 2
    while (nbToMine-- >= 0) {
        let minedBlock = await miner()

        console.log(`adding block to node`)
        let metadata = await node.registerBlock(minedBlock)
        console.log(`added block: ${JSON.stringify(metadata)}`)
    }

    console.log(`branches: ${await node.branches()}`)
}

async function testNodeTransfer() {
    const USE_NETWORK = false
    const NETWORK_BASE_PORT = 10000
    const NB_NODES = 2
    const DIFFICULTY = 2
    const NB_MINED_BLOCKS_INITIAL = 10
    const NB_MINED_BLOCKS_EACH_TOPOLOGY = 10

    let miner = TestTools.createSimpleMiner(Block.MASTER_BRANCH, null, DIFFICULTY)

    let nodes: NodeApi.NodeApi[] = []
    for (let i = 0; i < NB_NODES; i++) {
        let node: NodeApi.NodeApi = new NodeImpl.NodeImpl(`node ${i}`)

        if (USE_NETWORK) {
            let port = NETWORK_BASE_PORT + i
            let app = Tools.createExpressApp(port)
            let server = new NodeNetworkServer.NodeServer(node, newPeer => { }, closedPeer => { })
            server.initialize(app)

            let proxy = new NodeNetworkClient.NodeClient(node, 'localhost', port, () => { }, NETWORK_CLIENT_API)
            proxy.initialize()

            node = proxy.remoteFacade()
        }

        nodes.push(node)
    }

    let anyNode = () => nodes[Math.floor(Math.random() * nodes.length)]

    let checkAll = async () => {
        let ok = true
        let head = await nodes[0].blockChainHead(Block.MASTER_BRANCH)
        for (let i = 1; i < nodes.length; i++) {
            if (head != await nodes[i].blockChainHead(Block.MASTER_BRANCH)) {
                console.log(`node ${nodes[i].name} has head ${await nodes[i].blockChainHead(Block.MASTER_BRANCH)} instead of ${head}`)
                ok = false
            }
        }
        if (!ok)
            console.log(`error in checking all blocks`)
    }

    console.log(`mining initial blocks`)
    let initNode = anyNode()
    for (let i = 0; i < NB_MINED_BLOCKS_INITIAL; i++) {
        await initNode.registerBlock(await miner())
    }

    function fullyConnectedTopology(node, index) { return nodes.filter(n => n != node) }
    function circleTopology(node, index) { return [nodes[(index + 1) % nodes.length]] }

    let topologies = [
        fullyConnectedTopology,
        circleTopology
    ]

    for (let topology of topologies) {
        console.log(`switch to topology ${topology.name}\n`)

        // transfer contexts creation
        let nodeContexts: NodeTransfer.NodeTransfer[] = nodes.map(node => new NodeTransfer.NodeTransfer(node))
        nodeContexts.forEach((context, index) => context.initialize(topology(context.node, index)))

        // mine blocks and register them to any of the nodes
        let nbToMine = NB_MINED_BLOCKS_EACH_TOPOLOGY
        while (nbToMine-- >= 0) {
            let minedBlock = await miner()

            let nodeToRegisterBlock = anyNode()

            while (!await nodeToRegisterBlock.knowsBlock(minedBlock.previousBlockId)) {
                console.log(`waiting for block ${minedBlock.previousBlockId} availability on node ${nodeToRegisterBlock.name}`)
                await TestTools.wait(300)
            }

            console.log(`adding block to node ${nodeToRegisterBlock.name}`)
            let metadata = await nodeToRegisterBlock.registerBlock(minedBlock)
        }

        await TestTools.wait(1000)
        await checkAll()

        nodeContexts.forEach(context => context.terminate())
    }
}

async function testNodeProxy() {
    let server = new NodeNetworkServer.NodeServer({
        name: 'debug',
        knowsBlock: (blockId) => {
            console.log(`knowsBlock( ${blockId}`)
            return Promise.resolve(false)
        },
        branches: () => {
            console.log(`branches`)
            return Promise.resolve([])
        },
        blockChainHead: () => {
            console.log(`bch`)
            return Promise.resolve(null)
        },
        blockChainHeadLog: (depth) => {
            return Promise.resolve([])
        },
        blockChainBlockIds: (blockId, depth) => {
            return Promise.resolve([])
        },
        blockChainBlockMetadata: (blockId, depth) => {
            return Promise.resolve([])
        },
        blockChainBlockData: (blockId, depth) => {
            return Promise.resolve([])
        },
        registerBlock: async block => {
            console.log(`register block ${(await Block.idOfBlock(block)).substring(0, 5)} : ${JSON.stringify(block)}`)
            console.log(`*** it should be the same as the created one ***`)
            return null
        },
        addEventListener: (type, listener) => {
            console.log(`addListener`)
            setInterval(() => listener(Block.MASTER_BRANCH), 1000)
        },
        removeEventListener: (listener) => {
            console.log(`removeListener`)
        }
    }, newPeer => {
        console.log(`new peer : ${newPeer}`)
    }, closedPeer => {
        console.log(`closed peer : ${closedPeer}`)
    })
    let app = Tools.createExpressApp(9000)
    server.initialize(app)

    let proxy = new NodeNetworkClient.NodeClient(null, 'localhost', 9000, () => { }, NETWORK_CLIENT_API)
    proxy.initialize()

    let miner = TestTools.createSimpleMiner(Block.MASTER_BRANCH, null, 3)
    let block = await miner()
    let id = await Block.idOfBlock(block)
    console.log(`created ${id} : ${JSON.stringify(block)}`)
    let remoteNode = proxy.remoteFacade()
    let metadata = await remoteNode.registerBlock(block)
    remoteNode.addEventListener('head', () => console.log(`receive head change`))
}

async function testListOnBlockBasic() {
    let node = new NodeImpl.NodeImpl('alone')
    let miner = new MinerImpl.MinerImpl(node)
    let list = new ListOnChain.ListOnChain(node, Block.MASTER_BRANCH, 'main', miner)
    list.initialise()

    list.addListener(items => console.log(`list: ${JSON.stringify(items)}`))

    for (let i = 0; i < 3; i++)
        miner.addData(Block.MASTER_BRANCH, `Hello my friend ${i}`)
    await miner.mineData()

    console.log(`beginning`)

    for (let i = 0; i < 10; i++) {
        let txs = await list.addToList(['hello'])
        while (list.indexOfItem(txs[0]) < 0)
            await TestTools.wait(10)

        txs = await list.addToList(['world'])
        while (list.indexOfItem(txs[0]) < 0) {
            console.log(`waiting for ${txs[0]}`)
            await TestTools.wait(0)
        }

        txs = await list.addToList(['funky pop !!!'])
        while (list.indexOfItem(txs[0]) < 0) {
            console.log(`waiting for ${txs[0]}`)
            await TestTools.wait(0)
        }
    }
}

async function testListOnBlockSpeed() {
    let node = new NodeImpl.NodeImpl('alone')
    let miner = new MinerImpl.MinerImpl(node)
    let list = new ListOnChain.ListOnChain(node, Block.MASTER_BRANCH, 'main', miner)
    list.initialise()

    let waitedItems = new Map<string, string>()
    list.addListener(items => {
        console.log(`\nSUMMARY`)

        console.log(`list: ${JSON.stringify(list.getList())}`)

        for (let waited of waitedItems) {
            let id = waited[0]
            let name = waited[1]

            let confirmation = list.isItemConfirmed(id)
            console.log(`[${name}] ${id.substring(0, 8)} : ${confirmation}`)
        }
    })

    for (let i = 0; i < 3; i++)
        miner.addData(Block.MASTER_BRANCH, `initial-data-${i}`)
    await miner.mineData()

    console.log(`real beginning`)

    let insertIndex = 0
    for (let i = 0; i < 10; i++) {
        let txs = []
        for (let j = 0; j < 5; j++) {
            let itemName = `insert-${insertIndex++}`
            let iterTxs = await list.addToList([itemName])
            waitedItems.set(iterTxs[0], itemName)
            txs = txs.concat(iterTxs)

            // wait some time
            //await TestTools.wait(1000)

            // wait for the miner to empty its data pool
            // TODO in reality should be wait until miner sent a block with our last data...
            //await miner.mineData()

            // wait for a definite status on all items
            //for (let iterTx of iterTxs)
            //    await list.waitFor(iterTx)
        }

        for (let index = 0; index < txs.length; index++) {
            let tx = txs[index]
            let conf = await list.waitFor(tx)
            console.log(`${index}:${conf}`)
        }
    }

    await miner.mineData()
}

async function firstTest() {
}

let testers = [
    //firstTest,
    //testNodeProxy,
    //testDataSerialization,
    //testBasicMining,
    //testNodeTransfer,
    //testListOnBlockBasic,
    testListOnBlockSpeed
]

export async function testAll() {
    for (let tester of testers) {
        console.log(`\n\n${tester.name}\n`)
        await tester()
    }

    console.log(`done with testing`)
}