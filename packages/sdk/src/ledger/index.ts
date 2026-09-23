// @steward/sdk ledger module: the true-position ledger for a bStocks holding on BNB Smart Chain.
// Pure on-chain reconstruction from Transfer logs plus balance-vs-transfers corporate-action
// detection. No Binance Web3 API key, no transactions, no signing.
export type {
  PositionLedger,
  Lot,
  CorporateActionEvent,
  CorporateActionKind,
  TransferRecord,
  PriceFn,
} from "./types.js"
export { USDT_DECIMALS } from "./types.js"

export { buildPositionLedger, buildPortfolioLedger, type BuildLedgerOptions } from "./ledger.js"
export { fetchTransferLogs, TRANSFER_EVENT, type TransferScanOptions } from "./transfers.js"
export { reconstructLots, valueUnits, type LotReconstruction } from "./lots.js"
export { detectCorporateActions, type DetectCorporateActionsParams } from "./corporate-actions.js"
