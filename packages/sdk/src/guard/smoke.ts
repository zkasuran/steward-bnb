// Guard self-check. Two parts: pure verdict logic against constructed readings (deterministic, no
// network), then guardTrade end to end against BSC mainnet with a keyless MockWeb3ApiClient (free
// reads, no key, no transaction). Proves a scam clone blocks, a high premium warns, a normal genuine
// trade allows, a too-large trade resizes and a dead pool blocks. Exits nonzero on any mismatch.
import { getAddress, type Address } from "viem"
import { assessGuard, guardTrade, DEFAULT_GUARD_THRESHOLDS, type GuardAction, type GuardAssessment } from "./index.js"
import { MockWeb3ApiClient } from "../api/index.js"
import { USDT, BSTOCKS_CANDIDATES, KNOWN_SCAM_CLONE } from "../chain/constants.js"
import type { BuyEstimate, MarketStatus } from "../market/index.js"

const SAMPLE_POOL = getAddress("0xe9b9998B2EC5430D2246c7f1F8D9f298c97D7365")
const AAPLB: Address = BSTOCKS_CANDIDATES.AAPLB

const OPEN: MarketStatus = { isOpen: true, weekday: "Wed", etTime: "11:00", reason: "US regular session is open.", holidaysIgnored: true }
const CLOSED: MarketStatus = { isOpen: false, weekday: "Sat", etTime: "12:00", reason: "US markets are closed on the weekend (Sat).", holidaysIgnored: true }

// A healthy small buy; override the fields a case cares about.
function mkBuy(over: Partial<BuyEstimate> = {}): BuyEstimate {
  return {
    pool: SAMPLE_POOL, base: AAPLB, quote: USDT, symbolBase: "AAPLB", symbolQuote: "USDT",
    usdtIn: 50, feePpm: 2500, feePaidUsdt: 0.125, tokensOut: 0.2197, executionPrice: 227.6,
    spotPrice: 227.5, endPrice: 227.7, slippagePct: 0.2, priceMovePct: 0.08, reliable: true,
    note: "in-range estimate", atBlock: 60_000_000, ...over,
  }
}

function base(over: Partial<GuardAssessment>): GuardAssessment {
  return {
    token: AAPLB, usdtIn: 50, quote: USDT, symbol: "AAPLB", genuine: true,
    thresholds: DEFAULT_GUARD_THRESHOLDS, marketStatus: OPEN, ...over,
  }
}

const ref = (referencePrice: number, tokenToShareRatio = 1) => ({ referencePrice, tokenToShareRatio, asOf: Date.now(), source: "test" })

let failures = 0
function check(label: string, got: GuardAction, want: GuardAction, extra = ""): void {
  const ok = got === want
  if (!ok) failures++
  console.log(`  [${ok ? "OK" : "FAIL"}] ${label}: ${got}${want === got ? "" : ` (wanted ${want})`}${extra ? ` -- ${extra}` : ""}`)
}

async function main() {
  console.log("--- pure verdict logic (no network) ---")
  check("scam clone", assessGuard(base({ genuine: false })).action, "block")
  check("high premium (3%)", assessGuard(base({ spotUsdtPerToken: 227.5 * 1.03, reference: ref(227.5) })).action, "warn")
  check("very high premium (8%)", assessGuard(base({ spotUsdtPerToken: 227.5 * 1.08, reference: ref(227.5) })).action, "block")
  check("deep discount (7% under)", assessGuard(base({ spotUsdtPerToken: 227.5 * 0.93, reference: ref(227.5) })).action, "warn")
  check("10:1 ratio, fair price", assessGuard(base({ spotUsdtPerToken: 2275, reference: ref(227.5, 10), buy: mkBuy() })).action, "allow")
  check("normal genuine trade", assessGuard(base({ spotUsdtPerToken: 227.6, reference: ref(227.5), buy: mkBuy() })).action, "allow")
  check("high slippage (4%)", assessGuard(base({ spotUsdtPerToken: 227.6, reference: ref(227.5), buy: mkBuy({ slippagePct: 4, priceMovePct: 3.8 }) })).action, "resize")
  check("size too large (unreliable)", assessGuard(base({ spotUsdtPerToken: 227.6, reference: ref(227.5), buy: mkBuy({ reliable: false, slippagePct: 12, tokensOut: 999 }), suggestedUsdtIn: 40 })).action, "resize")
  check("no pool liquidity", assessGuard(base({ spotUsdtPerToken: 227.6, reference: ref(227.5), buy: mkBuy({ reliable: false, slippagePct: Number.POSITIVE_INFINITY, tokensOut: 0 }) })).action, "block")
  check("market closed", assessGuard(base({ spotUsdtPerToken: 227.6, reference: ref(227.5), buy: mkBuy(), marketStatus: CLOSED })).action, "warn")
  check("reference feed down", assessGuard(base({ spotUsdtPerToken: 227.6, referenceError: "feed timeout", buy: mkBuy() })).action, "warn")

  // A resize verdict must carry an actionable suggestion.
  const resizeV = assessGuard(base({ spotUsdtPerToken: 227.6, reference: ref(227.5), buy: mkBuy({ slippagePct: 4 }), suggestedUsdtIn: 22.5 }))
  if (resizeV.details.depth?.suggestedUsdtIn !== 22.5) { failures++; console.log("  [FAIL] resize carries suggestedUsdtIn") }
  else console.log("  [OK] resize carries suggestedUsdtIn: $22.50")

  console.log("\n--- guardTrade end to end (BSC mainnet, keyless mock, free reads) ---")
  const api = new MockWeb3ApiClient()
  try {
    const scam = await guardTrade({ token: KNOWN_SCAM_CLONE, usdtIn: 100, api, now: new Date() })
    console.log(`  scam clone ${KNOWN_SCAM_CLONE} -> ${scam.action}: ${scam.reasons[0]}`)
    check("live scam clone blocks", scam.action, "block")
    if (scam.details.authenticity.genuine) { failures++; console.log("  [FAIL] scam should not be genuine") }
  } catch (e) {
    failures++
    console.error(`  scam-clone read FAILED: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const v = await guardTrade({ token: AAPLB, usdtIn: 50, api, now: new Date() })
    console.log(`  genuine AAPLB $50 -> ${v.action}`)
    for (const r of v.reasons) console.log(`      - ${r}`)
    if (v.details.premium) {
      console.log(`      premium ${v.details.premium.premiumPct.toFixed(3)}% (spot ${v.details.premium.spotUsdtPerToken.toFixed(2)} vs fair ${v.details.premium.fairUsdtPerToken.toFixed(2)})`)
    }
    if (v.details.depth) console.log(`      slippage ${v.details.depth.slippagePct.toFixed(3)}% reliable=${v.details.depth.reliable} @ block ${v.details.atBlock}`)
    if (!v.details.authenticity.genuine) { failures++; console.log("  [FAIL] AAPLB should be genuine") }
    else console.log("  [OK] live composition ran: AAPLB is genuine, verdict computed")
  } catch (e) {
    failures++
    console.error(`  genuine AAPLB read FAILED: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (failures > 0) {
    console.error(`\nGUARD SMOKE FAILED: ${failures} failure(s).`)
    process.exit(1)
  }
  console.log("\nGUARD SMOKE OK: authenticity, premium-to-NAV, depth and market-hours verdicts check out.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
