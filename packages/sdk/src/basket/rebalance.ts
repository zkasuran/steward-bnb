// Turn a priced basket state into a rebalance plan. Pure math, no RPC. The plan restores the target
// weights of the legs that have drifted past the band: for each triggered leg the USDT amount is the
// gap between its target value and its current value, so a buy plus its matching sells land it back
// on target. Sells are ordered first, so the USDT they free funds the buys. This function returns a
// plan and NOTHING ELSE: executing it is a guarded-swap step, gated behind the wallet, never here.
import { DEFAULT_DRIFT_THRESHOLD_PCT } from "./baskets.js"
import type { BasketState, RebalanceLeg, RebalanceOptions, RebalancePlan } from "./types.js"

function emptyPlan(state: BasketState, threshold: number, note: string): RebalancePlan {
  return {
    basketId: state.basketId,
    driftThresholdPct: threshold,
    portfolioValueUsd: state.portfolioValueUsd,
    legs: [],
    totalBuyUsd: 0,
    totalSellUsd: 0,
    netUsdtDeltaUsd: 0,
    complete: state.complete,
    gated: true,
    note,
  }
}

export function planRebalance(state: BasketState, opts: RebalanceOptions = {}): RebalancePlan {
  const threshold = opts.driftThresholdPct ?? DEFAULT_DRIFT_THRESHOLD_PCT
  const minUsdtAmount = opts.minUsdtAmount ?? 0
  const P = state.portfolioValueUsd

  if (!(P > 0)) {
    return emptyPlan(state, threshold, "portfolio has no priced value, so there is nothing to rebalance")
  }

  const legs: RebalanceLeg[] = []
  for (const leg of state.legs) {
    // A held leg with no price has a fabricated weight (its value read as 0), so acting on its drift
    // would be guesswork. Skip it and let the plan's `complete` flag carry the warning.
    if (leg.priceUsd == null && leg.balance > 0n) continue
    if (Math.abs(leg.driftPct) <= threshold) continue

    const targetValue = leg.targetWeight * P
    const delta = targetValue - leg.valueUsd // >0 underweight -> buy, <0 overweight -> sell
    const usdtAmount = Math.abs(delta)
    if (usdtAmount < minUsdtAmount) continue

    legs.push({
      token: leg.token,
      ticker: leg.ticker,
      side: delta > 0 ? "buy" : "sell",
      usdtAmount,
      currentWeight: leg.currentWeight,
      targetWeight: leg.targetWeight,
      driftPct: leg.driftPct,
    })
  }

  // Sells first so the freed USDT funds the buys, each side largest-first, ticker as a stable
  // tie-break so the order is deterministic.
  legs.sort((a, b) => {
    if (a.side !== b.side) return a.side === "sell" ? -1 : 1
    if (b.usdtAmount !== a.usdtAmount) return b.usdtAmount - a.usdtAmount
    return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0
  })

  const totalBuyUsd = legs.filter((l) => l.side === "buy").reduce((s, l) => s + l.usdtAmount, 0)
  const totalSellUsd = legs.filter((l) => l.side === "sell").reduce((s, l) => s + l.usdtAmount, 0)
  const netUsdtDeltaUsd = totalSellUsd - totalBuyUsd

  let note: string
  if (legs.length === 0) {
    note = `every leg is within ${threshold} percentage points of target, so no rebalance is needed`
  } else {
    const funding =
      Math.abs(netUsdtDeltaUsd) < 1e-9
        ? "the sells fund the buys exactly"
        : netUsdtDeltaUsd > 0
          ? `the sells free $${netUsdtDeltaUsd.toFixed(2)} more USDT than the buys need`
          : `the buys need $${(-netUsdtDeltaUsd).toFixed(2)} of USDT beyond what the sells free`
    note = `${legs.length} leg(s) drifted past ${threshold}pp; ${funding}. Execution is a gated guarded-swap step, not performed here.`
  }
  if (!state.complete) {
    note += " Valuation was incomplete: at least one held leg could not be priced, so treat this plan as advisory."
  }

  return {
    basketId: state.basketId,
    driftThresholdPct: threshold,
    portfolioValueUsd: P,
    legs,
    totalBuyUsd,
    totalSellUsd,
    netUsdtDeltaUsd,
    complete: state.complete,
    gated: true,
    note,
  }
}
