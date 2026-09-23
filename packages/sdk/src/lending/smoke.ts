// Lending reader smoke test, run against BSC mainnet. Free reads only, no key, no transaction, no
// spend. Proves the four bStock Venus markets read as genuine listed collateral, that a Venus
// account report computes, that a Swipe quote sizes a safe USDT borrow, and that the unsigned tx
// builders emit well-formed { to, data, value } requests. Exits nonzero if any check fails.
import {
  BSTOCK_VENUS_MARKETS,
  readBStockMarket,
  readVenusAccount,
  readSwipeQuote,
  planBorrow,
  healthFactorAfterBorrow,
  buildSwipeTxs,
  buildBorrowUsdtTx,
} from "./index.js"

// zkasuran's public EOA. Any address works: with no Venus debt the health factor is null, which the
// report models explicitly rather than as a misleading zero or Infinity.
const SAMPLE_ACCOUNT = "0xDB6c6340342e71A63cD11Ebac2185204b7777777"

async function main() {
  let failures = 0

  console.log("--- bStock Venus collateral markets (live) ---")
  for (const key of Object.keys(BSTOCK_VENUS_MARKETS)) {
    try {
      const m = await readBStockMarket(key)
      const okRow = m.isListed && m.genuineBStock && m.collateralFactor > 0 && m.priceUsd > 0
      console.log(
        `${key} ${m.symbol} @ block ${m.atBlock}: listed=${m.isListed} genuine=${m.genuineBStock} ` +
          `CF=${m.collateralFactor} LT=${m.liquidationThreshold} price=$${m.priceUsd.toFixed(2)}`,
      )
      if (!okRow) {
        console.error(`  ${key} FAILED: not a usable genuine listed collateral market`)
        failures++
      }
    } catch (e) {
      console.error(`${key} FAILED: ${e instanceof Error ? e.message : String(e)}`)
      failures++
    }
  }

  console.log("\n--- Venus account report (live) ---")
  try {
    const r = await readVenusAccount(SAMPLE_ACCOUNT)
    console.log(
      `account ${r.account} @ block ${r.atBlock}: HF=${r.healthFactor ?? "null (no debt)"} ` +
        `collateral=$${r.totalCollateralUsd ?? "?"} borrow=$${r.totalBorrowUsd ?? "?"} entered=${r.markets.length}`,
    )
  } catch (e) {
    console.error(`account report FAILED: ${e instanceof Error ? e.message : String(e)}`)
    failures++
  }

  console.log("\n--- Swipe quote (live market, pure math) ---")
  try {
    const q = await readSwipeQuote({ market: "TSLAB", collateralUnits: 10, targetHealthFactor: 2 })
    console.log(
      `10 TSLAB = $${q.collateralValueUsd.toFixed(2)} collateral -> max safe borrow ` +
        `$${q.plan.maxSafeBorrowUsd.toFixed(2)} (bound: ${q.plan.bound}), HF then ` +
        `${q.plan.healthFactorAtMaxSafeBorrow?.toFixed(2)}, USDT liquidity $${q.availableUsdtLiquidityUsd.toFixed(0)}, ` +
        `fundable $${q.fundableBorrowUsd.toFixed(2)}`,
    )
    if (!(q.plan.maxSafeBorrowUsd >= 0) || q.collateralValueUsd <= 0) {
      console.error("  Swipe quote FAILED: nonsensical numbers")
      failures++
    }
  } catch (e) {
    console.error(`Swipe quote FAILED: ${e instanceof Error ? e.message : String(e)}`)
    failures++
  }

  console.log("\n--- pure math self-checks ---")
  // $1000 collateral, LT 0.7, CF 0.6, no existing debt, target HF 2.0.
  const plan = planBorrow({ collateralValueUsd: 1000, collateralFactor: 0.6, liquidationThreshold: 0.7, targetHealthFactor: 2 })
  // target-HF total = 700/2 = 350; CF cap = 600; smaller binds -> 350, HF then 700/350 = 2.0.
  const planOk = Math.abs(plan.maxSafeBorrowUsd - 350) < 1e-9 && plan.bound === "target-health-factor" && Math.abs((plan.healthFactorAtMaxSafeBorrow ?? 0) - 2) < 1e-9
  const after = healthFactorAfterBorrow({ collateralValueUsd: 1000, liquidationThreshold: 0.7, newBorrowUsd: 700 })
  // 700/700 = 1.0, exactly liquidatable.
  const afterOk = Math.abs((after.healthFactor ?? 0) - 1) < 1e-9 && after.liquidatable
  console.log(`planBorrow -> maxSafe=$${plan.maxSafeBorrowUsd} bound=${plan.bound} HF=${plan.healthFactorAtMaxSafeBorrow} : ${planOk ? "OK" : "FAIL"}`)
  console.log(`healthFactorAfterBorrow($700) -> HF=${after.healthFactor} liquidatable=${after.liquidatable} : ${afterOk ? "OK" : "FAIL"}`)
  if (!planOk || !afterOk) failures++

  console.log("\n--- unsigned tx builders ---")
  const oneToken = 10n ** 18n
  const txs = buildSwipeTxs({ market: "TSLAB", collateralAmount: oneToken, borrowUsdtAmount: 100n * oneToken })
  const borrow = buildBorrowUsdtTx(100n * oneToken)
  const shaped = txs.every((t) => /^0x[0-9a-fA-F]+$/.test(t.data) && t.value === 0n && /^0x[0-9a-fA-F]{40}$/.test(t.to)) && borrow.data.startsWith("0xc5ebeaec")
  for (const t of txs) console.log(`  ${t.label} -> to ${t.to} data ${t.data.slice(0, 10)} value ${t.value}`)
  if (!shaped) {
    console.error("  tx builders FAILED: malformed request or wrong borrow selector")
    failures++
  }

  if (failures > 0) {
    console.error(`\nLENDING SMOKE FAILED: ${failures} failure(s).`)
    process.exit(1)
  }
  console.log("\nLENDING SMOKE OK: bStocks are genuine listed Venus collateral, math and tx builders check out.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
