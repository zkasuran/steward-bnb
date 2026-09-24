// Deterministic unit tests for the basket core: weight and drift math (basketStateFromLegs) and the
// rebalance planner (planRebalance), plus the basket validator. All pure: synthetic priced legs, no
// RPC, so the portfolio arithmetic is fully reproducible.
import { test } from "node:test"
import assert from "node:assert/strict"
import type { Address } from "viem"
import { basketStateFromLegs } from "./analyze.js"
import { planRebalance } from "./rebalance.js"
import { validateBasket, basketWeightSum, MAG7_BASKET } from "./baskets.js"
import type { Basket, BasketLegInput } from "./types.js"

const TOKEN = "0x00000000000000000000000000000000000000a1" as Address
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`)

function leg(ticker: string, tokens: number, priceUsd: number | null, decimals = 18): BasketLegInput {
  return { ticker, token: TOKEN, genuine: true, decimals, balance: BigInt(tokens) * 10n ** BigInt(decimals), priceUsd }
}

const b2 = (): Basket => ({ id: "b2", name: "b2", description: "", weights: { A: 0.5, B: 0.5 } })
const b3 = (): Basket => ({ id: "b3", name: "b3", description: "", weights: { A: 0.5, B: 0.3, C: 0.2 } })

test("two legs derive portfolio value, current weights and signed drift", () => {
  const s = basketStateFromLegs(b2(), [leg("A", 60, 1), leg("B", 40, 1)])
  assert.equal(s.portfolioValueUsd, 100)
  assert.equal(s.complete, true)
  near(s.legs[0].currentWeight, 0.6)
  near(s.legs[1].currentWeight, 0.4)
  near(s.legs[0].driftPct, 10)
  near(s.legs[1].driftPct, -10)
})

test("three legs weight to one and carry the right drift signs", () => {
  const s = basketStateFromLegs(b3(), [leg("A", 60, 1), leg("B", 30, 1), leg("C", 10, 1)])
  assert.equal(s.portfolioValueUsd, 100)
  near(s.legs.reduce((t, l) => t + l.currentWeight, 0), 1)
  near(s.legs[0].driftPct, 10) // overweight
  near(s.legs[1].driftPct, 0) // on target
  near(s.legs[2].driftPct, -10) // underweight
})

test("a zero-threshold plan restores targets with sells ordered first to fund the buys", () => {
  const s = basketStateFromLegs(b2(), [leg("A", 70, 1), leg("B", 30, 1)])
  const plan = planRebalance(s, { driftThresholdPct: 0 })
  assert.equal(plan.legs.length, 2)
  assert.equal(plan.legs[0].side, "sell")
  assert.equal(plan.legs[0].ticker, "A")
  assert.equal(plan.legs[1].side, "buy")
  assert.equal(plan.totalSellUsd, 20)
  assert.equal(plan.totalBuyUsd, 20)
  assert.equal(plan.netUsdtDeltaUsd, 0)
  assert.equal(plan.gated, true)
})

test("a drift inside the threshold band produces no rebalance legs", () => {
  const s = basketStateFromLegs(b2(), [leg("A", 53, 1), leg("B", 47, 1)])
  const plan = planRebalance(s, { driftThresholdPct: 5 })
  assert.equal(plan.legs.length, 0)
  assert.match(plan.note, /within/)
})

test("an empty (unpriced) portfolio is guarded, not planned", () => {
  const s = basketStateFromLegs(b2(), [leg("A", 0, null), leg("B", 0, null)])
  const plan = planRebalance(s)
  assert.equal(plan.portfolioValueUsd, 0)
  assert.equal(plan.legs.length, 0)
  assert.match(plan.note, /nothing to rebalance/)
  assert.equal(plan.gated, true)
})

test("a shipped basket sums to one and validates", () => {
  near(basketWeightSum(MAG7_BASKET), 1)
  assert.doesNotThrow(() => validateBasket(MAG7_BASKET))
})

test("weights that do not sum to one are rejected", () => {
  const bad: Basket = { id: "bad", name: "bad", description: "", weights: { AAPLB: 0.3, MSFTB: 0.3 } }
  assert.throws(() => validateBasket(bad), /not ~1/)
})
