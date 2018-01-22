import * as Block from './block'
import * as NodeApi from './node-api'
import * as NodeImpl from './node-impl'
import * as NodeTransfer from './node-transfer'
import * as TestTools from './test-tools'
import * as NetworkApi from './network-api'
import * as WebSocketConnector from './websocket-connector'
import * as express from 'express'
import * as bodyParser from 'body-parser'
import * as WebSocket from 'ws'
import * as Request from 'request'

declare function ws(this: express.Server, url: string, callback: any)

declare module "express" {
    interface Server {
        ws(url: string, callback: any)
    }
}

export class NodeServer {
    constructor(
        private node: NodeApi.NodeApi,
        private newPeersReceiver: (peer: NodeApi.NodeApi) => void,
        private closedPeersReceiver: (peer: NodeApi.NodeApi) => void) { }

    // TODO check all input's validity !

    initialize(app: express.Server) {
        app.ws('/events', (ws, req) => {
            let connector = new WebSocketConnector.WebSocketConnector(this.node, ws)
            this.newPeersReceiver(connector)

            ws.on('error', err => {
                console.log(`error on ws ${err}`)
                ws.close()
            })

            ws.on('close', () => {
                console.log(`closed ws`)
                connector.terminate()
                this.closedPeersReceiver(connector)
            })
        })

        app.get('/ping', (req, res) => res.send(JSON.stringify({ message: 'hello' })))

        app.get('/branches', async (req, res) => res.send(JSON.stringify(await this.node.branches())))

        app.get('/blockChainHead/:branch', async (req, res) => {
            let branch = req.params.branch

            let result = await this.node.blockChainHead(branch)
            res.send(JSON.stringify(result))
        })

        app.get('/blockChainHeadLog/:depth', async (req, res) => {
            let branch = req.params.branch
            let depth = 1 * (req.params.depth || 1)

            let result = await this.node.blockChainHeadLog(branch, depth)
            res.send(JSON.stringify(result))
        })

        app.get('/blockChainBlockIds/:startBlockId/:depth', async (req, res) => {
            let depth = 1 * (req.params.depth || 1)
            let startBlockId = req.params.startBlockId

            let result = await this.node.blockChainBlockIds(startBlockId, depth)
            res.send(JSON.stringify(result))
        })

        app.get('/blockChainBlockMetadata/:startBlockId/:depth', async (req, res) => {
            let depth = 1 * (req.params.depth || 1)
            let startBlockId = req.params.startBlockId

            let result = await this.node.blockChainBlockMetadata(startBlockId, depth)
            res.send(JSON.stringify(result))
        })

        app.get('/blockChainBlockData/:startBlockId/:depth', async (req, res) => {
            let depth = 1 * (req.params.depth || 1)
            let startBlockId = req.params.startBlockId

            let result = await this.node.blockChainBlockData(startBlockId, depth)
            res.send(JSON.stringify(result))
        })

        app.post('/registerBlock', async (req, res) => {
            // TODO check that input is a real block !
            console.log(`received block ${JSON.stringify(req.body)}`)
            let metadata = await this.node.registerBlock(req.body as Block.Block)
            res.send(JSON.stringify(metadata))
        })

        app.get('/knowsBlock/:blockId', async (req, res) => {
            let blockId = req.params.blockId

            let result = await this.node.knowsBlock(blockId)
            res.send(JSON.stringify(result))
        })
    }
}