// @steward/sdk — public API surface.
// The core rule of this SDK: resolve a tokenized stock by its beacon, never by symbol, and never
// cache a balance, because bStocks rebase on dividends and splits. Everything in ./chain is a plain
// BSC RPC read and needs no Binance Web3 API key.
export * from "./chain/bstocks.js"
export * from "./chain/constants.js"

// Feature modules, namespaced to keep a clean, collision-free public surface:
// market.*, ledger.*, lending.*, api.*
export * as market from "./market/index.js"
export * as ledger from "./ledger/index.js"
export * as lending from "./lending/index.js"
export * as api from "./api/index.js"
