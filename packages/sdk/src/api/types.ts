// Typed request/response shapes for the Binance Web3 API surface Steward touches.
//
// VERIFIED 2026-09-24 against the live API. Doc root: https://web3.binance.com/en/dev-docs .
// The abstract *Request / *Response interfaces are Steward's own stable contract (what the SDK
// modules and the MockWeb3ApiClient use). The raw `*Raw` / `OC*` interfaces are the real
// on-the-wire shapes the HttpWeb3ApiClient maps FROM. Measured shapes, latencies and verbatim
// errors are in .hq/api-verification.json. Where our old guess differed from reality it is noted
// inline as MATCHED / DIFFERED so the mapping is auditable.
import type { Address, Hex } from "viem"

// --- shared envelope + errors -------------------------------------------------
// VERIFIED. Every endpoint returns this envelope. Business errors come back with HTTP 200 and a
// non-zero `code`; gateway auth/signature/timestamp/rate-limit errors come back with the real HTTP
// status (401/403/429) AND this envelope. Success is `code === 0`. Guessed {code,msg,data} matched;
// the real envelope also carries `timestamp` and `success`.
export interface ApiEnvelope<T> {
  code: number
  msg?: string
  data?: T | null
  timestamp?: number // ms epoch, server time
  success?: boolean // convenience flag, mirrors code === 0
}
export type OCResult<T> = ApiEnvelope<T>

export interface ApiError {
  code: number
  msg?: string
  httpStatus?: number
}

// --- RWA Data -----------------------------------------------------------------
// getReferencePrice -> GET /api/v1/dex/market/rwa/price (VERIFIED). Query param is
// `tokenContractAddresses` (PLURAL, comma-separated). Pass `tokenContractAddress` to address a token
// directly, else the Http client resolves `symbol` via the bStocks candidate map.
export interface ReferencePriceRequest {
  symbol: string
  tokenContractAddress?: Address // preferred; rwa/price is keyed by address, not symbol  // VERIFIED
  binanceChainId?: string // STRING, e.g. "56". Guessed number, real is string.  // VERIFIED
}

// Abstract shape the guard/holdings modules read. The Http client maps the real rwa/price row
// {tokenPrice, referencePrice, tokenPriceUpdatedAt} onto this.
// API invariant (VERIFIED): tokenPrice == referencePrice * tokenToShareRatio, so the ratio is
// derived as tokenPrice / referencePrice when rwa/price does not return it directly.
export interface ReferencePriceResponse {
  symbol: string
  referencePrice: string // decimal string  // MATCHED -> rwa/price.referencePrice
  tokenToShareRatio: string // "1" or "1.000224983929808861"  // DIFFERED -> derived or from rwa/tokens
  asOf: number // ms epoch  // DIFFERED -> rwa/price.tokenPriceUpdatedAt
  tokenPrice?: string // on-chain per-token price  // VERIFIED -> rwa/price.tokenPrice
  source?: string
}

// Raw rwa/price row (VERIFIED live shape).
export interface RwaPriceRowRaw {
  binanceChainId: string
  tokenContractAddress: string
  platformId: string // "bstock" | "ondo"
  tokenPrice: string
  referencePrice: string
  tokenPriceUpdatedAt: number // ms epoch
}

export type CorporateActionType =
  | "dividend"
  | "split"
  | "reverse_split"
  | "rebase"
  | "delisting"

export interface CorporateAction {
  type: CorporateActionType
  symbol: string
  token?: Address
  exDate?: number // ms epoch
  payDate?: number // ms epoch
  ratio?: string // splits: "2" = 2-for-1, decimal string
  cashPerShare?: string // dividends, decimal string
  currency?: string
  note?: string
}

// getCorporateActions -> DIFFERED. There is NO dedicated corporate-actions endpoint (VERIFIED).
// Dividends are derived from rwa/underlying-market.marketData.latestDividend / dividendYield; splits
// and rebases are detected on-chain by the ledger module. The Http client synthesizes a dividend
// action from the latest-dividend field and otherwise returns an empty list.
export interface CorporateActionsRequest {
  symbol?: string
  token?: Address
  tokenContractAddress?: Address // VERIFIED (used against underlying-market)
  since?: number // ms epoch
  binanceChainId?: string // VERIFIED (string)
}

export interface CorporateActionsResponse {
  actions: CorporateAction[]
}

// Real market state values (VERIFIED): openState(bool) is the reliable field; marketStatus is a
// string that may be null (e.g. "overnight"), reasonCode is e.g. "TRADING". The union stays open so
// real values pass through without breaking the "open"/"closed" callers.
export type MarketState = "open" | "closed" | "pre" | "post" | "overnight" | (string & {})

// getMarketStatus -> GET /api/v1/dex/market/rwa/underlying-market (VERIFIED). Param
// `tokenContractAddress` (SINGULAR).
export interface MarketStatusRequest {
  symbol?: string
  tokenContractAddress?: Address // VERIFIED
  market?: string // e.g. "US_EQUITY"
  binanceChainId?: string // VERIFIED
}

export interface MarketStatusResponse {
  market: string
  isOpen: boolean // MATCHED (name) -> statusInfo.openState
  state: MarketState // DIFFERED -> statusInfo.marketStatus (nullable) / statusInfo.reasonCode
  nextOpen?: number // DIFFERED -> statusInfo.nextOpenTime (ms|null)
  nextClose?: number // DIFFERED -> statusInfo.nextCloseTime (ms|null)
  asOf: number
  note?: string
  dividendYield?: string // BONUS -> marketData.dividendYield
  latestDividend?: string // BONUS -> marketData.latestDividend
}

// Raw rwa/underlying-market data (VERIFIED live shape).
export interface RwaUnderlyingMarketRaw {
  binanceChainId: string
  tokenContractAddress: string
  platformId: string
  assetType: number
  statusInfo: {
    openState: boolean
    marketStatus: string | null // e.g. "overnight"
    reasonCode: string | null // e.g. "TRADING"
    reasonMsg: string | null
    nextOpenTime: number | null
    nextCloseTime: number | null
  }
  marketData: {
    referencePrice: string | null
    high52W?: string | null
    low52W?: string | null
    volumeShares24H?: string | null
    avgDailyVolume1Y?: string | null
    totalShares?: string | null
    marketCap?: string | null
    turnoverRate?: string | null
    amplitude?: string | null
    dividendYield?: string | null
    latestDividend?: string | null
    peRatioTTM?: string | null
    pbRatio?: string | null
  }
}

// --- Market -------------------------------------------------------------------
// getPrice -> POST /api/v1/dex/market/price (VERIFIED). Batch: body is an array of
// {binanceChainId, tokenContractAddress}, up to 100. Guessed GET-by-symbol was wrong.
export interface PriceRequest {
  symbol: string
  tokenContractAddress?: Address // preferred; price is keyed by address  // VERIFIED
  binanceChainId?: string // VERIFIED (string)
}

export interface PriceResponse {
  symbol: string
  price: string // MATCHED -> price (string)
  asOf: number // DIFFERED -> time (ms epoch)
}

// Raw market/price row (VERIFIED live shape).
export interface MarketPriceRowRaw {
  binanceChainId: string
  tokenContractAddress: string
  price: string
  time: number // ms epoch
}

// getCandles -> GET /api/v1/dex/market/candles (doc-listed, not probed this pass).
export interface CandlesRequest {
  symbol: string
  tokenContractAddress?: Address
  bar: string // e.g. "1m" / "1h" / "1d"
  limit?: number
  binanceChainId?: string
}

export type Candle = readonly [
  open: string,
  high: string,
  low: string,
  close: string,
  volume: string,
  timestamp: number,
]

export interface CandlesResponse {
  symbol: string
  bar: string
  candles: Candle[]
}

// --- Trading ------------------------------------------------------------------
export type QuoteSide = "buy" | "sell"
// Our provider label. bStock routes via SWAP (vendorName "LiquidMesh") or RFQ ("PcsXRfq"); Ondo is
// RFQ. The Http client resolves the token pair and reads the real vendorName + executionMode.
export type QuoteProvider = "bstock" | "ondo" | string

// getQuote -> GET /api/v1/dex/aggregator/quote (VERIFIED). Address-based, returns an array of routes
// sorted by toTokenAmount desc, each with its own quoteId (TTL ~30s).
export interface QuoteRequest {
  symbol: string
  side: QuoteSide
  amount: string // input amount, smallest unit (decimal string)  // VERIFIED
  fromTokenAddress?: Address // VERIFIED (real param)
  toTokenAddress?: Address // VERIFIED (real param)
  provider?: QuoteProvider
  userWalletAddress?: Address // VERIFIED (real param)
  binanceChainId?: string // VERIFIED
}

export interface QuoteResponse {
  symbol: string
  side: QuoteSide
  provider: QuoteProvider // DIFFERED -> route.vendorName
  tokenPrice: string // DIFFERED -> route.toToken/fromToken.tokenUnitPrice
  referencePrice?: string
  tokenToShareRatio?: string
  inAmount: string // DIFFERED -> route.fromTokenAmount
  outAmount: string // DIFFERED -> route.toTokenAmount
  quoteId?: string // VERIFIED -> route.quoteId
  executionMode?: string // VERIFIED -> "SWAP" | "RFQ"
  vendorName?: string // VERIFIED -> route.vendorName
  priceImpactPercent?: string // VERIFIED
  requestPath?: string // the signed requestPath (carries /build)
  expiresAt?: number // ms epoch (derived: now + ~30s)
}

// Raw aggregator quote route (VERIFIED live shape).
export interface AggregatorQuoteTokenRaw {
  tokenContractAddress: string
  tokenSymbol: string
  tokenUnitPrice: string
  decimal: string
  isHoneyPot?: boolean
  taxRate?: string
}
export interface AggregatorQuoteRouteRaw {
  quoteId: string
  vendorName: string
  executionMode: string // "SWAP" | "RFQ"
  binanceChainId: string
  fromTokenAmount: string
  toTokenAmount: string
  tradeFee?: string
  estimateGasFee?: string
  priceImpactPercent?: string
  router?: string
  fromToken: AggregatorQuoteTokenRaw
  toToken: AggregatorQuoteTokenRaw
  approveTarget?: string
  isBest?: boolean
}

// --- Transaction (simulate before send) ---------------------------------------
// simulateTransaction -> POST /api/v1/dex/pre-transaction/simulate (VERIFIED). Body is
// {binanceChainId, evmTx:{from,to,data,value}} (or solTx / tronTx by chain family).
export interface SimulateRequest {
  from: Address
  to: Address
  data: Hex
  value?: string // wei, decimal string  // VERIFIED
  binanceChainId?: string // VERIFIED
}

export interface BalanceChange {
  token?: Address
  symbol?: string
  decimals?: number
  before?: string
  after?: string
  delta?: string
}

export interface AllowanceChange {
  token?: Address
  spender?: Address
  before?: string
  after?: string
  delta?: string
}

export interface SimulateResponse {
  success: boolean // DIFFERED -> derived from status === "SUCCESS"
  status?: string // VERIFIED -> data.status (e.g. "SUCCESS")
  failReason?: string // VERIFIED -> data.failReason
  balanceChanges: BalanceChange[] // MATCHED (name)
  allowanceChanges: AllowanceChange[] // MATCHED (name)
  gasUsed?: string // DIFFERED -> not returned by simulate; use pre-transaction/gas-limit
  error?: ApiError
}

// Raw simulate data (VERIFIED wrapper shape; change-array element fields not observed non-empty on
// the base tier, so mapping stays permissive).
export interface SimulateResultRaw {
  status: string
  failReason?: string
  balanceChanges?: unknown[]
  allowanceChanges?: unknown[]
}

// --- Wallet -------------------------------------------------------------------
// getBalances -> GET /api/v1/dex/balance/all-token-balances-by-address (VERIFIED). Paginated: the
// real payload is [{page, pageSize, tokenAssets:[...]}]. NOTE: returned an empty tokenAssets list
// with code 0 for known-funded addresses on the base tier (see .hq/api-verification.json).
export interface BalancesRequest {
  address: Address
  binanceChainId?: string // VERIFIED
}

export interface WalletBalance {
  token: Address
  symbol?: string
  decimals?: number
  balance: string // never cache a bStocks balance (it rebases)
}

export interface BalancesResponse {
  address: Address
  balances: WalletBalance[]
}

// Raw balances page (VERIFIED wrapper shape; tokenAssets element shape unconfirmed on base tier).
export interface WalletBalancePageRaw {
  page: number
  pageSize: number
  tokenAssets: Array<Record<string, unknown>>
}

// --- b402 Payments ------------------------------------------------------------
// getPaymentRequirements is a PAYEE-side x402 construct (the `accepts[]` a resource server returns
// on HTTP 402), NOT a Binance GET. The real b402 module is an x402 facilitator: /verify and /settle
// act on a client-built payment, /supported lists networks + assets + schemes. The Http client builds
// the requirement locally (as the mock does); it never calls /settle (that moves funds). `amount` is
// x402 v2 `amount` (not v1 maxAmountRequired); `decimals` is load-bearing to price it.
export interface PaymentRequirements {
  scheme: string // e.g. "exact"
  network: string // e.g. "bsc"
  asset: Address // token contract
  amount: string // atomic units, decimal string
  payTo: Address
  maxTimeoutSeconds: number
  decimals: number // asset decimals, needed to price `amount`
  extra?: Record<string, unknown>
}

export interface PaymentRequirementsRequest {
  resource?: string
  symbol?: string
}

export interface PaymentRequirementsResponse {
  accepts: PaymentRequirements[]
}
