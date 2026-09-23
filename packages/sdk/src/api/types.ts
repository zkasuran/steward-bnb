// Typed request/response shapes for the Binance Web3 API surface Steward touches.
//
// UNVERIFIED. Every field name here is reconstructed from the roost rival README hints in
// .hq/MEMORY.md, not from a Binance doc page, so the DevEx time-to-first-call clock (25%,
// once-only) stays honest. Each name the human must confirm carries a `// VERIFY in clocked
// session` marker. Nothing in this file calls Binance.
import type { Address, Hex } from "viem"

// --- shared envelope + errors -------------------------------------------------
// roost hint: the API returns HTTP 200 even on failure, with the real status in a body
// `code`, so a real client inspects `code`, never just the HTTP status.
export interface ApiError {
  code: string | number // VERIFY in clocked session
  msg?: string // VERIFY in clocked session
}

export interface ApiEnvelope<T> {
  code: string | number // "0" / 0 on success  // VERIFY in clocked session
  msg?: string
  data?: T
}

// --- RWA Data -----------------------------------------------------------------
export interface ReferencePriceRequest {
  symbol: string
  binanceChainId?: number // chain param is `binanceChainId`, not `chainId`  // VERIFY in clocked session
}

// roost hint: reference price is DERIVED so that
// tokenPrice / (referencePrice * tokenToShareRatio) == 1.000 for every listed token, so it is
// a screening signal, not a tradeable spread. Real spread comes from a Trading quote.
// tokenToShareRatio is load-bearing: a 10:1 token misreads as a 900% spread if ignored.
export interface ReferencePriceResponse {
  symbol: string
  referencePrice: string // decimal string  // VERIFY in clocked session
  tokenToShareRatio: string // e.g. "1" or "10"  // VERIFY in clocked session
  asOf: number // ms epoch  // VERIFY in clocked session
  source?: string
}

export type CorporateActionType =
  | "dividend"
  | "split"
  | "reverse_split"
  | "rebase"
  | "delisting" // VERIFY in clocked session

export interface CorporateAction {
  type: CorporateActionType
  symbol: string
  token?: Address
  exDate?: number // ms epoch  // VERIFY in clocked session
  payDate?: number // ms epoch  // VERIFY in clocked session
  ratio?: string // splits: "2" = 2-for-1, decimal string  // VERIFY in clocked session
  cashPerShare?: string // dividends, decimal string  // VERIFY in clocked session
  currency?: string
  note?: string
}

export interface CorporateActionsRequest {
  symbol?: string
  token?: Address
  since?: number // ms epoch  // VERIFY in clocked session
  binanceChainId?: number // VERIFY in clocked session
}

export interface CorporateActionsResponse {
  actions: CorporateAction[]
}

export type MarketState = "open" | "closed" | "pre" | "post" // VERIFY in clocked session

export interface MarketStatusRequest {
  symbol?: string
  market?: string // e.g. "US_EQUITY"  // VERIFY in clocked session
}

export interface MarketStatusResponse {
  market: string
  isOpen: boolean
  state: MarketState
  nextOpen?: number // ms epoch  // VERIFY in clocked session
  nextClose?: number // ms epoch  // VERIFY in clocked session
  asOf: number
  note?: string
}

// --- Market -------------------------------------------------------------------
export interface PriceRequest {
  symbol: string
  binanceChainId?: number // VERIFY in clocked session
}

export interface PriceResponse {
  symbol: string
  price: string // decimal string  // VERIFY in clocked session
  asOf: number
}

export interface CandlesRequest {
  symbol: string
  bar: string // roost hint: `bar` is lowercase, e.g. "1m" / "1h" / "1d"  // VERIFY in clocked session
  limit?: number
}

// roost hint: a candle row is a positional array with the TIMESTAMP at index 5, not index 0.
export type Candle = readonly [
  open: string,
  high: string,
  low: string,
  close: string,
  volume: string,
  timestamp: number,
] // VERIFY in clocked session

export interface CandlesResponse {
  symbol: string
  bar: string
  candles: Candle[]
}

// --- Trading ------------------------------------------------------------------
export type QuoteSide = "buy" | "sell"
// roost hint: bStock quotes route through the aggregator, Ondo is an RFQ that refuses without
// a userWalletAddress.
export type QuoteProvider = "bstock" | "ondo" // VERIFY in clocked session

export interface QuoteRequest {
  symbol: string
  side: QuoteSide
  amount: string // input amount, decimal string  // VERIFY in clocked session
  provider?: QuoteProvider
  userWalletAddress?: Address // required for the Ondo RFQ, ignored by bStock  // VERIFY in clocked session
  binanceChainId?: number // VERIFY in clocked session
}

export interface QuoteResponse {
  symbol: string
  side: QuoteSide
  provider: QuoteProvider
  tokenPrice: string // on-chain token price  // VERIFY in clocked session
  referencePrice?: string // the derived reference, for the spread read
  tokenToShareRatio?: string
  inAmount: string // VERIFY in clocked session
  outAmount: string // VERIFY in clocked session
  requestPath?: string // the signed requestPath; carries the `/build` prefix  // VERIFY in clocked session
  expiresAt?: number // ms epoch
}

// --- Transaction (simulate before send) ---------------------------------------
export interface SimulateRequest {
  from: Address
  to: Address
  data: Hex
  value?: string // wei, decimal string  // VERIFY in clocked session
  binanceChainId?: number // VERIFY in clocked session
}

export interface BalanceChange {
  token: Address
  symbol?: string
  decimals?: number
  before: string
  after: string
  delta: string // signed decimal string  // VERIFY in clocked session
}

export interface AllowanceChange {
  token: Address
  spender: Address
  before: string
  after: string
  delta: string // VERIFY in clocked session
}

export interface SimulateResponse {
  success: boolean
  balanceChanges: BalanceChange[]
  allowanceChanges: AllowanceChange[]
  gasUsed?: string
  error?: ApiError
}

// --- Wallet -------------------------------------------------------------------
export interface BalancesRequest {
  address: Address
  binanceChainId?: number // VERIFY in clocked session
}

export interface WalletBalance {
  token: Address
  symbol?: string
  decimals?: number
  balance: string // raw balance; never cache a bStocks balance (it rebases)
}

export interface BalancesResponse {
  address: Address
  balances: WalletBalance[]
}

// --- b402 Payments ------------------------------------------------------------
// x402-style requirement. The amount field is `amount` (x402 v2), NOT `maxAmountRequired`
// (v1). `decimals` is load-bearing: without it a client cannot turn the atomic `amount` into
// a human figure (the OKX x402 lesson).
export interface PaymentRequirements {
  scheme: string // e.g. "exact"  // VERIFY in clocked session
  network: string // e.g. "bsc"  // VERIFY in clocked session
  asset: Address // token contract  // VERIFY in clocked session
  amount: string // atomic units, decimal string  // VERIFY in clocked session
  payTo: Address // VERIFY in clocked session
  maxTimeoutSeconds: number // VERIFY in clocked session
  decimals: number // asset decimals, needed to price `amount`  // VERIFY in clocked session
  extra?: Record<string, unknown> // scheme-specific  // VERIFY in clocked session
}

export interface PaymentRequirementsRequest {
  resource?: string // the gated resource path  // VERIFY in clocked session
  symbol?: string
}

export interface PaymentRequirementsResponse {
  accepts: PaymentRequirements[] // x402 returns an `accepts` array  // VERIFY in clocked session
}
