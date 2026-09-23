// @steward/sdk guard module: the pre-trade gate. One entry point, guardTrade, folds four checks into
// one verdict: authenticity by beacon, premium-to-NAV against the reference price, depth/slippage
// from the pool and US market hours. All reads are plain BSC RPC plus the injected Web3ApiClient;
// nothing signs, sends, spends or needs a Binance key. assessGuard is the pure, testable core.
export * from "./types.js"
export { assessGuard, type GuardAssessment } from "./assess.js"
export { guardTrade, suggestSafeUsdtIn, type GuardTradeInput } from "./guard.js"
