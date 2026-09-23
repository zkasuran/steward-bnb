// Types for the Steward pre-trade guard. The guard gates a bStock buy on four independent checks
// (authenticity, premium-to-NAV, depth/slippage, market hours) and returns one structured verdict.
// Nothing here reads the chain or calls Binance; these are plain data shapes.
import type { Address } from "viem"
import type { BuyEstimate } from "../market/slippage.js"
import type { MarketStatus } from "../market/hours.js"

// The verdict, in rising severity. `allow` place it, `warn` place it but know the risk, `resize`
// change the size before placing it, `block` do not place it.
export type GuardAction = "allow" | "warn" | "resize" | "block"

// Severity order used to fold the per-check verdicts into one. Higher wins.
export const ACTION_RANK: Record<GuardAction, number> = {
  allow: 0,
  warn: 1,
  resize: 2,
  block: 3,
}

// Thresholds every check reads. All overridable; the defaults are the ones the guard ships with.
export interface GuardThresholds {
  // On-chain price this far above the reference price (percent) warns the buyer they pay a premium.
  premiumWarnPct: number
  // On-chain price this far above the reference price (percent) blocks the buy as a bad overpay.
  premiumBlockPct: number
  // On-chain price this far BELOW the reference price (percent) warns: a discount that large usually
  // means a stale reference or a token under stress, not free money.
  discountWarnPct: number
  // Estimated buy slippage (percent) at or above this warns.
  slippageWarnPct: number
  // Estimated buy slippage (percent) at or above this (or an unreliable estimate) asks for a resize.
  slippageResizePct: number
}

export const DEFAULT_GUARD_THRESHOLDS: GuardThresholds = {
  premiumWarnPct: 1,
  premiumBlockPct: 5,
  discountWarnPct: 5,
  slippageWarnPct: 1,
  slippageResizePct: 3,
}

export interface AuthenticityDetail {
  // True only when the token's EIP-1967 beacon slot points at the known bStocks beacon.
  genuine: boolean
  // How authenticity was decided, so a reader never assumes it was a symbol match.
  method: "eip1967-beacon"
}

export interface PremiumDetail {
  // On-chain spot, USDT per whole token, from the deepest PancakeSwap v3 pool.
  spotUsdtPerToken: number
  // Reference (NAV) price per underlying share, from the RWA Data reference-price feed.
  referencePrice: number
  // Tokens-to-shares ratio. A 10:1 token needs this or it reads as a 900% premium.
  tokenToShareRatio: number
  // referencePrice * tokenToShareRatio: the fair on-chain price per token.
  fairUsdtPerToken: number
  // (spot - fair) / fair, in percent. Positive is a premium (overpay), negative is a discount.
  premiumPct: number
  source?: string
  // ms epoch the reference was quoted.
  asOf: number
}

// The depth reading plus the resize hint the guard computes when a trade is too big.
export type DepthDetail = BuyEstimate & {
  // The largest USDT size that keeps slippage under the resize limit, when the requested size does
  // not. Absent when no smaller size helps (a pool with no liquidity) or none was needed.
  suggestedUsdtIn?: number
}

export interface GuardDetails {
  token: Address
  usdtIn: number
  // The bStock symbol the reference price was looked up under (from chain or the caller).
  symbol?: string
  // Quote token the trade and price are denominated in (BSC USDT by default).
  quote: Address
  authenticity: AuthenticityDetail
  premium?: PremiumDetail
  // Set when the premium check could not run (reference price unavailable), so the caller knows a
  // safety check was skipped rather than passed.
  premiumError?: string
  depth?: DepthDetail
  // Set when the on-chain market could not be read (no pool, RPC failure), which blocks the trade.
  depthError?: string
  marketHours?: MarketStatus
  thresholds: GuardThresholds
  // Block the on-chain reads were pinned to, when a pool was read.
  atBlock?: number
}

export interface GuardVerdict {
  action: GuardAction
  // Plain-English reasons a non-crypto user can act on, one per triggered check.
  reasons: string[]
  details: GuardDetails
}
