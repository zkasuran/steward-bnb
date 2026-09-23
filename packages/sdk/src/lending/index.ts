// @steward/sdk lending layer — the Venus (BSC money-market) reader and tx builders behind "Swipe":
// borrow USDT against a bStocks position instead of selling it. This is SPOT collateralised
// borrowing, NOT a perp and NOT margin trading. Reads are plain BSC RPC and need no Binance Web3 API
// key; the transaction builders only ENCODE unsigned calldata, so nothing here signs, sends or spends.
//
// VERIFIED on BSC mainnet 2026-09-23: genuine bStocks ARE listed Venus core-pool collateral markets
// (TSLAB, NVDAB, SPCXB, SKHYB), each with a non-zero collateral factor, so Swipe is a real flow, not
// a hypothetical. The health and borrow math is generic and reusable regardless.
export * from "./constants.js"
export * from "./math.js"
export * from "./health.js"
export * from "./swipe.js"
export * from "./borrow.js"
