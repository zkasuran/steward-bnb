// Types for the "Conviction" module: self-rebalancing thematic baskets over GENUINE bStocks.
// A basket is a rule ("AI chips", "Mag 7") expressed as target weights over tickers that each
// resolve, by beacon, to a genuine bStocks token. The analysis reads real holdings and prices,
// the rebalance produces a plan only. Nothing here signs, sends or spends: execution of the plan
// is a GATED guarded-swap step handled elsewhere.
import type { Address } from "viem"

// A thematic basket. `weights` maps a bStock ticker (AAPLB, NVDAB, ...) to its target fraction of
// the basket, and the fractions sum to ~1. The tickers must resolve to genuine bStocks; a weight
// on an unknown or scam-cloned symbol is rejected by validateBasket, never quietly dropped.
export interface Basket {
  id: string
  name: string
  description: string
  weights: Record<string, number>
}

// One leg as the analysis takes it in, before weights and drift are derived. `balance` is the raw
// on-chain balance (never cached: a bStock rebases on dividends and splits), `decimals` is read
// from the token, and `priceUsd` is USDT per whole token or null when the leg could not be priced.
export interface BasketLegInput {
  ticker: string
  token: Address
  // Beacon-verified genuine bStock. A false here means the symbol resolved to something whose
  // beacon slot does not point at the bStocks beacon, so it is a clone and its balance is not trusted.
  genuine: boolean
  decimals: number
  balance: bigint
  priceUsd: number | null
}

// One leg after the portfolio math. `driftPct = (currentWeight - targetWeight) * 100`, in
// percentage points: positive means overweight (hold too much, a rebalance would SELL), negative
// means underweight (a rebalance would BUY).
export interface BasketLegState {
  ticker: string
  token: Address
  genuine: boolean
  decimals: number
  balance: bigint
  // Human units, formatUnits(balance, decimals).
  units: number
  priceUsd: number | null
  // units * priceUsd, or 0 when the leg has no price.
  valueUsd: number
  targetWeight: number
  currentWeight: number
  driftPct: number
}

// A basket priced against one holder's wallet at one moment.
export interface BasketState {
  basketId: string
  name: string
  // The wallet the balances were read from, or null for a purely synthetic valuation.
  holder: Address | null
  legs: BasketLegState[]
  portfolioValueUsd: number
  // False when a leg that holds a non-zero balance could not be priced, so its weight and any
  // drift are not trustworthy. A plan built on an incomplete valuation is flagged, not hidden.
  complete: boolean
  readAt: number
  // The block the holdings were read at, or null for a synthetic / priceFn-only valuation.
  atBlock: number | null
}

// A leg to price during analysis: ticker plus its beacon-resolved token.
export interface PriceableLeg {
  ticker: string
  token: Address
}

export interface AnalyzeOptions {
  // Supply a price (USDT per whole token) per leg instead of reading PancakeSwap. When absent, the
  // analysis reads the deepest bStock/USDT v3 pool for each genuine leg via the market module.
  priceFn?: (leg: PriceableLeg) => number | Promise<number>
  // Quote token for the market reads. Defaults to BSC USDT.
  quote?: Address
  // A client to reuse for the market reads. When absent the market module manages its own endpoint
  // fallback. Holdings are always read under the module's own fallback.
  client?: import("viem").PublicClient
}

export interface RebalanceOptions {
  // Trigger a leg only when the magnitude of its drift, in percentage points, is strictly greater
  // than this. Defaults to DEFAULT_DRIFT_THRESHOLD_PCT. A threshold of 0 acts on every drifted leg.
  driftThresholdPct?: number
  // Drop any triggered leg whose USDT amount is below this dust floor. Defaults to 0.
  minUsdtAmount?: number
}

// One instruction in a rebalance plan. `usdtAmount` is in USDT: for a "sell" it is the USDT value
// of the token to sell, for a "buy" it is the USDT to spend on the token. Never a signed action.
export interface RebalanceLeg {
  token: Address
  ticker: string
  side: "buy" | "sell"
  usdtAmount: number
  currentWeight: number
  targetWeight: number
  driftPct: number
}

// The plan. Ordered sells-first so the raised USDT funds the buys. `gated` is always true: this is
// the plan, execution is a separate guarded-swap step that this module never performs.
export interface RebalancePlan {
  basketId: string
  driftThresholdPct: number
  portfolioValueUsd: number
  legs: RebalanceLeg[]
  totalBuyUsd: number
  totalSellUsd: number
  // totalSellUsd - totalBuyUsd. Positive means the sells free more USDT than the buys need
  // (untriggered underweight legs were left alone); negative means the plan needs USDT added.
  netUsdtDeltaUsd: number
  // Carried from the state: false means the valuation was incomplete, so treat the plan as advisory.
  complete: boolean
  gated: true
  note: string
}
