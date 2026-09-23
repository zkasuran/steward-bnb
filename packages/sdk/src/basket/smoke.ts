// Basket self-check. Deterministic weight/drift math and rebalance-restoration proofs on synthetic
// holdings, no network needed. Then a best-effort live read against the house EOA that logs but
// never gates the result. Free reads only, no Binance Web3 API key, no transaction, no spend.
import { parseUnits, getAddress } from "viem"
import {
  EXAMPLE_BASKETS,
  INDEX_BASKET,
  validateBasket,
  resolveTicker,
  basketStateFromLegs,
  planRebalance,
  analyzeBasket,
  resolveBasketTokens,
  type Basket,
  type BasketLegInput,
  type BasketState,
  type RebalancePlan,
} from "./index.js"

let failures = 0
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${label}`)
  if (!cond) failures++
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps
function throws(fn: () => void): boolean {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

const DEC = 18
// A synthetic leg. `units` whole tokens at `priceUsd`; genuine defaults true. Balance is built with
// parseUnits so the decimals path (formatUnits in the core) is exercised, not bypassed.
function leg(ticker: string, units: number, priceUsd: number | null, genuine = true): BasketLegInput {
  const token = resolveTicker(ticker)
  if (!token) throw new Error(`test ticker ${ticker} did not resolve`)
  return { ticker, token, genuine, decimals: DEC, balance: parseUnits(String(units), DEC), priceUsd }
}

// Apply a plan to a state's leg values and return each leg's resulting weight against its target,
// so a test can assert the plan actually lands the portfolio back on its targets.
function applyPlan(state: BasketState, plan: RebalancePlan): { ticker: string; target: number; weight: number }[] {
  const value = new Map<string, number>()
  for (const l of state.legs) value.set(l.ticker, l.valueUsd)
  for (const l of plan.legs) {
    value.set(l.ticker, (value.get(l.ticker) ?? 0) + (l.side === "buy" ? l.usdtAmount : -l.usdtAmount))
  }
  const total = [...value.values()].reduce((s, v) => s + v, 0)
  return state.legs.map((l) => ({
    ticker: l.ticker,
    target: l.targetWeight,
    weight: total > 0 ? (value.get(l.ticker) ?? 0) / total : 0,
  }))
}

async function main() {
  console.log("--- shipped baskets validate ---")
  for (const b of EXAMPLE_BASKETS) {
    const valid = !throws(() => validateBasket(b))
    const allResolve = Object.keys(b.weights).every((t) => resolveTicker(t) !== null)
    check(`${b.id} validates and every ticker resolves`, valid && allResolve)
  }
  check(
    "weights not summing to ~1 are rejected",
    throws(() => validateBasket({ id: "bad", name: "bad", description: "", weights: { AAPLB: 0.5 } })),
  )
  check(
    "an unknown ticker is rejected",
    throws(() => validateBasket({ id: "bad2", name: "bad2", description: "", weights: { FOOB: 1 } })),
  )

  console.log("\n--- weight + drift math (synthetic, INDEX_BASKET) ---")
  // SPYB $600 + QQQB $400 = $1000 against a 50/50 target: SPYB 60% (+10pp), QQQB 40% (-10pp).
  const s = basketStateFromLegs(INDEX_BASKET, [leg("SPYB", 100, 6), leg("QQQB", 100, 4)])
  const spy = s.legs.find((l) => l.ticker === "SPYB")!
  const qqq = s.legs.find((l) => l.ticker === "QQQB")!
  check("portfolio value is $1000", near(s.portfolioValueUsd, 1000))
  check("SPYB current weight 0.60", near(spy.currentWeight, 0.6))
  check("QQQB current weight 0.40", near(qqq.currentWeight, 0.4))
  check("SPYB drift +10pp (overweight)", near(spy.driftPct, 10))
  check("QQQB drift -10pp (underweight)", near(qqq.driftPct, -10))
  check("state is complete", s.complete)

  console.log("\n--- rebalance restores targets (threshold 0) ---")
  const plan0 = planRebalance(s, { driftThresholdPct: 0 })
  const sell = plan0.legs.find((l) => l.ticker === "SPYB")
  const buy = plan0.legs.find((l) => l.ticker === "QQQB")
  check("SPYB leg is a $100 sell", !!sell && sell.side === "sell" && near(sell.usdtAmount, 100))
  check("QQQB leg is a $100 buy", !!buy && buy.side === "buy" && near(buy.usdtAmount, 100))
  check("sells ordered before buys", plan0.legs.length === 2 && plan0.legs[0].side === "sell")
  check("sells fund buys exactly (net USDT ~0)", near(plan0.netUsdtDeltaUsd, 0))
  check("plan is gated (plan only, no execution)", plan0.gated === true)
  const restored = applyPlan(s, plan0)
  check("post-rebalance weights equal targets", restored.every((r) => near(r.weight, r.target)))

  console.log("\n--- threshold gating ---")
  const planHigh = planRebalance(s, { driftThresholdPct: 15 })
  check("15pp threshold above a 10pp drift yields an empty plan", planHigh.legs.length === 0)

  console.log("\n--- 3-leg: partial vs full rebalance ---")
  const custom: Basket = {
    id: "t3",
    name: "synthetic three-leg",
    description: "test-only",
    weights: { AAPLB: 0.5, MSFTB: 0.3, NVDAB: 0.2 },
  }
  check("custom 3-leg basket validates", !throws(() => validateBasket(custom)))
  // $700 / $200 / $100 = $1000: AAPLB 70% (+20pp), MSFTB 20% (-10pp), NVDAB 10% (-10pp).
  const s3 = basketStateFromLegs(custom, [leg("AAPLB", 700, 1), leg("MSFTB", 200, 1), leg("NVDAB", 100, 1)])
  check("3-leg portfolio value is $1000", near(s3.portfolioValueUsd, 1000))
  const partial = planRebalance(s3, { driftThresholdPct: 15 })
  check(
    "only AAPLB triggers at 15pp, a $200 sell",
    partial.legs.length === 1 &&
      partial.legs[0].ticker === "AAPLB" &&
      partial.legs[0].side === "sell" &&
      near(partial.legs[0].usdtAmount, 200),
  )
  check("partial plan frees ~$200 net USDT", near(partial.netUsdtDeltaUsd, 200))
  const full = planRebalance(s3, { driftThresholdPct: 5 })
  check("all 3 legs trigger at 5pp", full.legs.length === 3)
  check("full 3-leg rebalance nets ~0 USDT", near(full.netUsdtDeltaUsd, 0, 1e-6))
  const r3 = applyPlan(s3, full)
  check("post-rebalance 3-leg weights equal targets", r3.every((r) => near(r.weight, r.target, 1e-9)))

  console.log("\n--- empty / incomplete guards ---")
  const empty = basketStateFromLegs(INDEX_BASKET, [leg("SPYB", 0, null), leg("QQQB", 0, null)])
  check("empty portfolio -> empty plan, no crash", planRebalance(empty).legs.length === 0)
  const incomplete = basketStateFromLegs(INDEX_BASKET, [leg("SPYB", 100, null), leg("QQQB", 100, 4)])
  check("held leg with no price marks state incomplete", incomplete.complete === false)
  check("plan carries the incomplete warning", planRebalance(incomplete).complete === false)

  console.log("\n--- live read (best-effort, does not gate) ---")
  try {
    const holder = getAddress("0xDB6c6340342e71A63cD11Ebac2185204b7777777")
    const resolved = await resolveBasketTokens(INDEX_BASKET.weights)
    for (const r of resolved) console.log(`    ${r.ticker} ${r.token} genuine=${r.genuine}`)
    const live = await analyzeBasket(INDEX_BASKET, holder)
    console.log(`    portfolio $${live.portfolioValueUsd.toFixed(2)} @ block ${live.atBlock} complete=${live.complete}`)
    for (const l of live.legs) {
      console.log(
        `      ${l.ticker} bal ${l.units} price ${l.priceUsd ?? "n/a"} ` +
          `weight ${(l.currentWeight * 100).toFixed(1)}% drift ${l.driftPct.toFixed(1)}pp`,
      )
    }
    const livePlan = planRebalance(live, { driftThresholdPct: 5 })
    console.log(`    plan: ${livePlan.legs.length} leg(s) - ${livePlan.note}`)
  } catch (e) {
    console.log(`    live read skipped: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (failures > 0) {
    console.error(`\nBASKET SELF-CHECK FAILED: ${failures} failure(s).`)
    process.exit(1)
  }
  console.log("\nBASKET SELF-CHECK OK: weight/drift math and rebalance restoration verified (deterministic).")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
