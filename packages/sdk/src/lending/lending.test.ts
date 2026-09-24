// Deterministic unit tests for the pure lending math: weighted collateral, health factor, the borrow
// planner and the post-borrow health projection. No RPC, no viem: every figure is hand-checkable
// against the formulas in the comments.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  weightedCollateralUsd,
  borrowLimitUsd,
  healthFactor,
  healthFactorFromCollateral,
  priceDropToLiquidationPct,
  planBorrow,
  healthFactorAfterBorrow,
} from "./math.js"

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`)

test("weighted collateral and the protocol borrow cap apply their weights", () => {
  near(weightedCollateralUsd(1000, 0.8), 800)
  near(borrowLimitUsd(1000, 0.7), 700)
})

test("health factor is weighted collateral over debt; null with no debt", () => {
  assert.equal(healthFactor(800, 400), 2)
  assert.equal(healthFactor(800, 0), null)
  near(healthFactorFromCollateral(1000, 0.8, 400) as number, 2)
})

test("price drop to liquidation is 1 - 1/hf clamped; null with no debt", () => {
  near(priceDropToLiquidationPct(2) as number, 50)
  assert.equal(priceDropToLiquidationPct(1), 0)
  assert.equal(priceDropToLiquidationPct(null), null)
})

test("planBorrow bound by the target health factor returns weighted/targetHF", () => {
  const p = planBorrow({ collateralValueUsd: 1000, collateralFactor: 0.7, liquidationThreshold: 0.8, targetHealthFactor: 2 })
  near(p.weightedCollateralUsd, 800)
  near(p.borrowLimitUsd, 700)
  near(p.maxSafeBorrowUsd, 400) // 800 / 2, under the 700 cap
  assert.equal(p.bound, "target-health-factor")
  near(p.healthFactorAtMaxSafeBorrow as number, 2)
})

test("planBorrow bound by the protocol collateral factor returns the lower cap", () => {
  const p = planBorrow({ collateralValueUsd: 1000, collateralFactor: 0.3, liquidationThreshold: 0.8, targetHealthFactor: 1.5 })
  near(p.maxSafeBorrowUsd, 300) // min(800/1.5, 300) = 300
  assert.equal(p.bound, "protocol-collateral-factor")
})

test("planBorrow on an already-stretched account offers zero new borrow", () => {
  const p = planBorrow({ collateralValueUsd: 1000, collateralFactor: 0.7, liquidationThreshold: 0.8, targetHealthFactor: 2, existingBorrowUsd: 500 })
  assert.equal(p.maxSafeBorrowUsd, 0)
  assert.equal(p.bound, "already-at-limit")
})

test("planBorrow rejects a non-positive target health factor", () => {
  assert.throws(
    () => planBorrow({ collateralValueUsd: 1000, collateralFactor: 0.7, liquidationThreshold: 0.8, targetHealthFactor: 0 }),
    /targetHealthFactor/,
  )
})

test("healthFactorAfterBorrow flags a borrow that lands the account at or below 1", () => {
  const h = healthFactorAfterBorrow({ collateralValueUsd: 1000, liquidationThreshold: 0.8, newBorrowUsd: 900 })
  assert.equal(h.totalBorrowUsd, 900)
  near(h.healthFactor as number, 800 / 900) // 0.888..., liquidatable
  assert.equal(h.liquidatable, true)
  assert.equal(h.priceDropToLiquidationPct, 0) // already below 1, no fall needed
})

test("healthFactorAfterBorrow leaves a safe borrow healthy", () => {
  const h = healthFactorAfterBorrow({ collateralValueUsd: 1000, liquidationThreshold: 0.8, newBorrowUsd: 400 })
  near(h.healthFactor as number, 2)
  assert.equal(h.liquidatable, false)
  near(h.priceDropToLiquidationPct as number, 50)
})
