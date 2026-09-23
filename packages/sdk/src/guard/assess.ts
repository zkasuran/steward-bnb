// Pure pre-trade verdict logic. Given the readings the guard gathered (authenticity, on-chain spot,
// reference price, a buy estimate, market hours), fold them into one verdict with plain-English
// reasons. No RPC, no API, no clock: everything is passed in, so this is deterministic and unit
// -testable without a network. `guardTrade` in guard.ts is the async orchestrator that feeds it.
import type { Address } from "viem"
import type { BuyEstimate } from "../market/slippage.js"
import type { MarketStatus } from "../market/hours.js"
import {
  ACTION_RANK,
  type GuardAction,
  type GuardDetails,
  type GuardThresholds,
  type GuardVerdict,
} from "./types.js"

// The inputs `guardTrade` collects and hands to the pure verdict. Every field past the first block
// is optional, because a check that could not run (no pool, reference feed down) degrades to a
// skipped check rather than crashing the whole guard.
export interface GuardAssessment {
  token: Address
  usdtIn: number
  quote: Address
  symbol?: string
  genuine: boolean
  thresholds: GuardThresholds
  marketStatus: MarketStatus
  // Premium-to-NAV inputs.
  spotUsdtPerToken?: number
  reference?: { referencePrice: number; tokenToShareRatio: number; source?: string; asOf: number }
  referenceError?: string
  // Depth/slippage input and the resize hint.
  buy?: BuyEstimate
  suggestedUsdtIn?: number
  // Set when the on-chain market read failed.
  marketError?: string
  atBlock?: number
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`
}

export function assessGuard(a: GuardAssessment): GuardVerdict {
  const contributions: { action: GuardAction; reason: string }[] = []
  const details: GuardDetails = {
    token: a.token,
    usdtIn: a.usdtIn,
    symbol: a.symbol,
    quote: a.quote,
    authenticity: { genuine: a.genuine, method: "eip1967-beacon" },
    marketHours: a.marketStatus,
    thresholds: a.thresholds,
    atBlock: a.atBlock,
  }

  // 1. AUTHENTICITY. A scam clone is a hard block and nothing else matters once it fails, so the
  // verdict stops here rather than pricing a token nobody should buy.
  if (!a.genuine) {
    contributions.push({
      action: "block",
      reason:
        "This token is not a genuine bStocks stock token. Its on-chain proxy does not point at the official bStocks beacon, so it is almost certainly a scam look-alike. The trade is blocked.",
    })
    return finish(contributions, details)
  }

  // 2. PREMIUM-TO-NAV. Compare on-chain spot to the reference price times the token-to-share ratio.
  if (a.reference && a.spotUsdtPerToken !== undefined) {
    const fair = a.reference.referencePrice * a.reference.tokenToShareRatio
    const premiumPct = fair > 0 ? ((a.spotUsdtPerToken - fair) / fair) * 100 : Number.NaN
    details.premium = {
      spotUsdtPerToken: a.spotUsdtPerToken,
      referencePrice: a.reference.referencePrice,
      tokenToShareRatio: a.reference.tokenToShareRatio,
      fairUsdtPerToken: fair,
      premiumPct,
      source: a.reference.source,
      asOf: a.reference.asOf,
    }
    if (Number.isFinite(premiumPct)) {
      if (premiumPct >= a.thresholds.premiumBlockPct) {
        contributions.push({
          action: "block",
          reason: `You would pay about ${premiumPct.toFixed(2)}% more than the stock's reference price. That is above the ${a.thresholds.premiumBlockPct}% limit, so the trade is blocked to stop you overpaying.`,
        })
      } else if (premiumPct >= a.thresholds.premiumWarnPct) {
        contributions.push({
          action: "warn",
          reason: `The on-chain price is about ${premiumPct.toFixed(2)}% above the stock's reference price, so you would pay a premium over fair value.`,
        })
      } else if (premiumPct <= -a.thresholds.discountWarnPct) {
        contributions.push({
          action: "warn",
          reason: `The on-chain price is about ${Math.abs(premiumPct).toFixed(2)}% below the stock's reference price. A discount this large usually means the reference is stale or the token is under stress, so treat the quote with caution.`,
        })
      }
    }
  } else if (a.spotUsdtPerToken !== undefined) {
    // Spot read but no reference: surface the skipped safety check as a warn, do not silently pass.
    details.premiumError = a.referenceError ?? "reference price unavailable"
    contributions.push({
      action: "warn",
      reason: `Could not check the price against the stock's reference (${details.premiumError}), so the premium-to-NAV safety check was skipped.`,
    })
  }

  // 3. DEPTH / SLIPPAGE. Use the market module's USDT-buy estimate for the requested size.
  if (a.marketError) {
    details.depthError = a.marketError
    contributions.push({
      action: "block",
      reason: `No on-chain USDT market was found for this token, so it cannot be priced or traded here (${a.marketError}).`,
    })
  } else if (a.buy) {
    details.depth = { ...a.buy, suggestedUsdtIn: a.suggestedUsdtIn }
    const noFill = !Number.isFinite(a.buy.slippagePct) || a.buy.tokensOut <= 0
    const hint = a.suggestedUsdtIn !== undefined ? `, try about ${usd(a.suggestedUsdtIn)} instead` : ""
    if (!a.buy.reliable && noFill) {
      contributions.push({
        action: "block",
        reason: "This pool has no liquidity to fill your buy right now, so the trade cannot be placed here.",
      })
    } else if (!a.buy.reliable) {
      contributions.push({
        action: "resize",
        reason: `Your ${usd(a.usdtIn)} buy is too large for this pool and the slippage estimate is not reliable at this size${hint}.`,
      })
    } else if (a.buy.slippagePct >= a.thresholds.slippageResizePct) {
      contributions.push({
        action: "resize",
        reason: `Buying ${usd(a.usdtIn)} would cost about ${a.buy.slippagePct.toFixed(2)}% in slippage, above the ${a.thresholds.slippageResizePct}% limit${hint}.`,
      })
    } else if (a.buy.slippagePct >= a.thresholds.slippageWarnPct) {
      contributions.push({
        action: "warn",
        reason: `Buying ${usd(a.usdtIn)} would cost about ${a.buy.slippagePct.toFixed(2)}% in slippage on this pool.`,
      })
    }
  }

  // 4. MARKET HOURS. A closed US session means the reference is frozen while the token keeps trading.
  if (!a.marketStatus.isOpen) {
    contributions.push({
      action: "warn",
      reason: `${a.marketStatus.reason} The reference price is stale while the market is closed, so the on-chain price may have drifted from fair value.`,
    })
  }

  return finish(contributions, details)
}

function finish(
  contributions: { action: GuardAction; reason: string }[],
  details: GuardDetails,
): GuardVerdict {
  let action: GuardAction = "allow"
  for (const c of contributions) {
    if (ACTION_RANK[c.action] > ACTION_RANK[action]) action = c.action
  }
  const reasons = contributions.map((c) => c.reason)
  if (reasons.length === 0) {
    reasons.push("No problems found. The token is genuine and the trade looks safe to place.")
  }
  return { action, reasons, details }
}
