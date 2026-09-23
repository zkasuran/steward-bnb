// Market reader smoke test, run against BSC mainnet. Free read only, no key, no transaction. Proves
// a known bStock/USDT pool resolves and verifies against the factory, that sqrtPriceX96 converts to
// a sane USDT price, that liquidity and reserves read, and that a small USDT buy estimate computes.
// Exits nonzero if a pool fails to verify, a price is non-finite or non-positive, or the buy
// estimate returns nothing.
import { getMarket, spotInQuote, estimateUsdtBuy, marketHours, KNOWN_POOLS } from "./index.js"
import { USDT } from "../chain/constants.js"

async function main() {
  console.log(`market hours now: ${marketHours().reason}\n`)

  let failures = 0
  for (const [label, pool] of Object.entries(KNOWN_POOLS)) {
    try {
      // opts.pool takes the verify-a-known-pool path: read token0/token1/fee and refuse anything
      // the factory does not own for that pair and tier.
      const state = await getMarket("0x0000000000000000000000000000000000000000", { pool })
      const spot = spotInQuote(state, USDT)
      const buy = estimateUsdtBuy(state, 1000, USDT)
      console.log(`${label} pool ${state.pool} @ block ${state.atBlock}`)
      console.log(`  pair ${state.symbol0}/${state.symbol1} fee ${state.fee} tick ${state.tick}`)
      console.log(`  spot ${spot.toFixed(6)} USDT per ${buy.symbolBase}`)
      console.log(
        `  reserves ${state.reserve0Human.toLocaleString()} ${state.symbol0} / ${state.reserve1Human.toLocaleString()} ${state.symbol1}`,
      )
      console.log(
        `  buy 1000 USDT -> ${buy.tokensOut.toFixed(6)} ${buy.symbolBase}, slippage ${buy.slippagePct.toFixed(3)}% (move ${buy.priceMovePct.toFixed(3)}%, ${buy.reliable ? "reliable" : "unreliable"}: ${buy.note})\n`,
      )
      if (!Number.isFinite(spot) || spot <= 0) failures++
      if (!Number.isFinite(buy.tokensOut) || buy.tokensOut <= 0) failures++
    } catch (e) {
      console.error(`${label} FAILED: ${e instanceof Error ? e.message : String(e)}\n`)
      failures++
    }
  }

  if (failures > 0) {
    console.error(`MARKET SMOKE FAILED: ${failures} failure(s).`)
    process.exit(1)
  }
  console.log("MARKET SMOKE OK: pools verify, prices compute, buy estimates return.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
