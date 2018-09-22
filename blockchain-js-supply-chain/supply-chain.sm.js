/**
 * This is a Supply Chain smart contract implementation
 * 
 * Askers ask and Biders bid.
 * 
 * All of them must be registered.
 * 
 * Identity is provided by the 'identity-registry-1' contract
 */
({
    /**
     */
    init: function () {
        this.data.users = {}
        this.data.asks = {}
        this.data.bids = {}
    },

    /** 
    * @param data { email }, signed by the email's public key on identity smart contract
     */
    createAccount: function (args) {
        console.log(`creating account...`)

        let signInData = callContract(null, 'identity-registry-1', 0, 'signIn', args)
        if (!signInData || !signInData.email) {
            console.log(`signIn failed`)
            return null
        }

        let email = signInData.email

        if (this.data.users[email]) {
            console.log(`already exists account for ${email}`)
            return null
        }

        this.data.users[email] = {
            items: ['wood', 'water', 'ball'],
            balance: 10
        }

        console.log(`account registered!`, this.data.users[email])

        return this.data.users[email]
    },

    hasAccount: function (args) {
        if (!lib.checkStringArgs(args, ['email']))
            return false

        return args.email in this.data.users
    },

    getState: function () {
        return this.data
    },

    /**
     * Ask :
     * 
     * - initiated : public, but not yet closed. offers are made against this Bids
     * - closed : all asks are fullfilled => coins and items are updated
     * 
     * @param data { email, id, title, description, asks : { description: string }[] }, signed by the ask's creator's email's public key on identity smart contract
     */
    publishAsk: function (args) {
        let ask = callContract(null, 'identity-registry-1', 0, 'signIn', args)
        if (!ask || !ask.email) {
            console.log(`signIn failed`)
            return null
        }

        let email = ask.email

        if (!lib.checkStringArgs(ask, ['email', 'id', 'title', 'description']))
            return null
        if (!lib.checkArgs(ask, ['asks']))
            return null

        if (ask.id in this.data.asks) {
            console.error(`ask already existing`)
            return null
        }

        this.data.asks[ask.id] = ask

        console.log(`'ask' ${ask.id} just added !`)
    },

    /**
     * Select an offer, signed with the ask creator
     * 
     * The offer is then unavailable for other participants
     * When all ask's offers have been selected, the ask is closed and coins and items are updated
     * 
     * All that happens only if the provider has enough coins !
     */
    selectBid: function (data) {
    },

    /**
     * Offer :
     * 
     * - not selected : (the offer is selected by the first Bids in the chain to select it)
     * - selected : the offer has been selected by the ask made for it
     */
    publishBid: function (bid) {
    }
})