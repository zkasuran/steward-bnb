// @steward/sdk basket layer — "Conviction": self-rebalancing thematic baskets over GENUINE bStocks.
// A basket is a target-weight rule over tickers that each resolve, by beacon, to a real bStocks
// token. analyzeBasket reads a wallet and derives current weights and drift; planRebalance returns
// the ordered plan to restore targets. Reads are free BSC RPC, no Binance Web3 API key. Executing a
// plan is a GATED guarded-swap step handled elsewhere: nothing in this module signs, sends or spends.
export * from "./types.js"
export * from "./baskets.js"
export * from "./resolve.js"
export * from "./analyze.js"
export * from "./rebalance.js"
