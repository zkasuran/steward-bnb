// Pure borrow/health math for spot collateralised lending. No RPC, no viem, no I/O. These are the
// same primitives Venus weighs, so they reconcile with the on-chain reader, but they are generic:
// they hold for any over-collateralised money market, which is why they stay useful even where a
// given collateral is not (yet) a listed market.
//
// Framing: this is SPOT borrowing against collateral the holder keeps, NOT a perp and NOT margin.
// Health factor is the ratio of liquidation-weighted collateral to debt. Venus liquidates when it
// crosses 1. Two different weights are in play and never mixed: the LIQUIDATION THRESHOLD answers
// "when am I liquidated" (health factor) and the COLLATERAL FACTOR answers "how much may I borrow"
// (the protocol's hard cap). The collateral factor is the lower of the two, so it binds first.

/** Collateral value after the liquidation-threshold haircut, in USD. */
export function weightedCollateralUsd(collateralValueUsd: number, liquidationThreshold: number): number {
  return collateralValueUsd * liquidationThreshold
}

/**
 * Health factor = liquidation-weighted collateral / debt. Returns null when there is no debt,
 * because there is then no liquidation point to report: Infinity would render as a sortable figure
 * and 0 would read as the most dangerous position on the shelf. A number here is the ratio of the
 * numbers shown, so a reader can check it with a calculator.
 */
export function healthFactor(weightedCollateral: number, borrowUsd: number): number | null {
  if (borrowUsd <= 0) return null
  return weightedCollateral / borrowUsd
}

/** Health factor straight from a raw collateral value, its threshold and the debt. */
export function healthFactorFromCollateral(
  collateralValueUsd: number,
  liquidationThreshold: number,
  borrowUsd: number,
): number | null {
  return healthFactor(weightedCollateralUsd(collateralValueUsd, liquidationThreshold), borrowUsd)
}

/**
 * The protocol's hard borrow cap: collateral value weighted by the COLLATERAL FACTOR. Venus refuses
 * a borrow that would push total debt above this, whatever health factor the caller was aiming for.
 */
export function borrowLimitUsd(collateralValueUsd: number, collateralFactor: number): number {
  return collateralValueUsd * collateralFactor
}

/**
 * The uniform collateral-price fall that lands the health factor on 1, as a percent. It holds the
 * debt's own price still, which is right for a stablecoin debt like USDT. Clamped at 0 because a
 * position already at or under 1 needs no fall at all.
 */
export function priceDropToLiquidationPct(hf: number | null): number | null {
  if (hf === null) return null
  return Math.max(0, 1 - 1 / hf) * 100
}

export interface BorrowPlanInput {
  /** USD value of the bStocks position offered as collateral (amount times oracle price). */
  collateralValueUsd: number
  /** Strategy-0 weight: how much may be borrowed against the collateral. */
  collateralFactor: number
  /** Strategy-1 weight: where Venus liquidates. */
  liquidationThreshold: number
  /** Debt already outstanding on the account, in USD. Defaults to 0. */
  existingBorrowUsd?: number
  /** The health-factor buffer the holder wants to keep after borrowing, e.g. 2.0. Must be > 0. */
  targetHealthFactor: number
}

export interface BorrowPlan {
  collateralValueUsd: number
  /** Collateral after the liquidation-threshold haircut. */
  weightedCollateralUsd: number
  /** Protocol hard cap on total debt (collateral factor weight). */
  borrowLimitUsd: number
  targetHealthFactor: number
  /** Max NEW USDT to borrow now while keeping at least the target health factor and staying under
   * the protocol cap. Never negative: an already-stretched account returns 0. */
  maxSafeBorrowUsd: number
  /** Health factor the account would sit at after taking maxSafeBorrowUsd. */
  healthFactorAtMaxSafeBorrow: number | null
  /** Which limit bound the answer: the holder's target, or the protocol's collateral factor. */
  bound: "target-health-factor" | "protocol-collateral-factor" | "already-at-limit"
}

/**
 * Given a bStocks collateral value in USD and a target health factor, the largest USDT borrow that
 * is safe now. It is the smaller of two ceilings, minus any existing debt: the target-health-factor
 * ceiling (weightedCollateral / targetHF) and the protocol's own collateral-factor cap. Reporting
 * the smaller of the two is the honest number, because a borrow above the protocol cap simply reverts.
 */
export function planBorrow(input: BorrowPlanInput): BorrowPlan {
  const { collateralValueUsd, collateralFactor, liquidationThreshold, targetHealthFactor } = input
  const existingBorrowUsd = input.existingBorrowUsd ?? 0
  if (targetHealthFactor <= 0) throw new Error(`targetHealthFactor must be > 0: ${targetHealthFactor}`)

  const weighted = weightedCollateralUsd(collateralValueUsd, liquidationThreshold)
  const limit = borrowLimitUsd(collateralValueUsd, collateralFactor)
  const totalAtTargetHf = weighted / targetHealthFactor

  const allowedTotal = Math.min(totalAtTargetHf, limit)
  const maxNew = Math.max(0, allowedTotal - existingBorrowUsd)
  const totalAfter = existingBorrowUsd + maxNew

  let bound: BorrowPlan["bound"]
  if (maxNew <= 0) bound = "already-at-limit"
  else if (totalAtTargetHf <= limit) bound = "target-health-factor"
  else bound = "protocol-collateral-factor"

  return {
    collateralValueUsd,
    weightedCollateralUsd: weighted,
    borrowLimitUsd: limit,
    targetHealthFactor,
    maxSafeBorrowUsd: maxNew,
    healthFactorAtMaxSafeBorrow: healthFactor(weighted, totalAfter),
    bound,
  }
}

export interface HealthAfterBorrowInput {
  collateralValueUsd: number
  liquidationThreshold: number
  existingBorrowUsd?: number
  /** The USDT borrow being considered, in USD. */
  newBorrowUsd: number
}

export interface HealthAfterBorrow {
  totalBorrowUsd: number
  healthFactor: number | null
  priceDropToLiquidationPct: number | null
  /** True when the resulting health factor would sit at or below 1, i.e. immediately liquidatable. */
  liquidatable: boolean
}

/** The health factor and liquidation distance the account would have after a proposed USDT borrow. */
export function healthFactorAfterBorrow(input: HealthAfterBorrowInput): HealthAfterBorrow {
  const existingBorrowUsd = input.existingBorrowUsd ?? 0
  const total = existingBorrowUsd + input.newBorrowUsd
  const weighted = weightedCollateralUsd(input.collateralValueUsd, input.liquidationThreshold)
  const hf = healthFactor(weighted, total)
  return {
    totalBorrowUsd: total,
    healthFactor: hf,
    priceDropToLiquidationPct: priceDropToLiquidationPct(hf),
    liquidatable: hf !== null && hf <= 1,
  }
}
