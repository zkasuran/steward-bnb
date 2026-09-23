// @steward/sdk providers layer. Read-only cross-provider comparison for the SAME underlying equity
// across the three tokenized-stock families on BSC: bStocks (deep, tradeable), Ondo (thin) and xStocks
// (dust / mostly absent). Detection helpers bind each family's authenticity on chain (bStocks beacon,
// Ondo MINTER_ROLE, Backed xStock heuristic). compareProviders assembles the honest comparison.
//
// This is a comparison and honesty surface, NOT an execution path: a DEX arb across the three
// representations is not executable on today's open BSC liquidity. Reads only, no Binance Web3 API key,
// no transaction, no spend.
export * from "./constants.js"
export * from "./detect.js"
export * from "./compare.js"

// The bStocks detector lives with the on-chain reader; re-exported so all three family checks import
// from one place.
export { isGenuineBStock } from "../chain/bstocks.js"
