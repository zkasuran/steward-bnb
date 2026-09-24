// Deterministic unit tests for the pure pre-trade verdict core (assessGuard). No RPC, no clock, no
// Binance call: every reading is a synthetic input, so the folded verdict is fully reproducible.
import { test } from "node:test"
import assert from "node:assert/strict"
import type { Address } from "viem"
import { assessGuard, type GuardAssessment } from "./assess.js"
import { DEFAULT_GUARD_THRESHOLDS } from "./types.js"
import type { MarketStatus } from "../market/hours.js"
import type { BuyEstimate } from "../market/slippage.js"

const TOKEN = "0x00000000000000000000000000000000000000a1" as Address
const USDT = "0x55d398326f99059fF775485246999027B3197955" as Address

function openMarket(): MarketStatus {
  return {
    isOpen: true,
    weekday: "Wed",
    etTime: "12:00",
    reason: "US regular session is open (12:00 ET, Wed). Holidays are not checked here.",
    holidaysIgnored: true,
  }
}

function closedMarket(): MarketStatus {
  return {
    isOpen: false,
    weekday: "Sat",
    etTime: "12:00",
    reason: "US markets are closed on the weekend (Sat).",
    holidaysIgnored: true,
  }
}

function mkBuy(over: Partial<BuyEstimate> = {}): BuyEstimate {
  return {
    pool: TOKEN,
    base: TOKEN,
    quote: USDT,
    symbolBase: "AAPLB",
    symbolQuote: "USDT",
    usdtIn: 100,
    feePpm: 2500,
    feePaidUsdt: 0.25,
    tokensOut: 0.5,
    executionPrice: 200,
    spotPrice: 200,
    endPrice: 200.1,
    slippagePct: 0.1,
    priceMovePct: 0.05,
    reliable: true,
    note: "in-range estimate",
    atBlock: 1,
    ...over,
  }
}

function base(over: Partial<GuardAssessment> = {}): GuardAssessment {
  return {
    token: TOKEN,
    usdtIn: 100,
    quote: USDT,
    symbol: "AAPLB",
    genuine: true,
    thresholds: DEFAULT_GUARD_THRESHOLDS,
    marketStatus: openMarket(),
    ...over,
  }
}

test("genuine token in a normal market allows the trade with the clean-bill reason", () => {
  const v = assessGuard(
    base({
      reference: { referencePrice: 100, tokenToShareRatio: 1, asOf: 0 },
      spotUsdtPerToken: 100,
      buy: mkBuy({ slippagePct: 0.1, reliable: true }),
    }),
  )
  assert.equal(v.action, "allow")
  assert.equal(v.reasons.length, 1)
  assert.match(v.reasons[0], /No problems found/)
})

test("a token that fails the beacon check is blocked outright", () => {
  const v = assessGuard(base({ genuine: false }))
  assert.equal(v.action, "block")
  assert.equal(v.reasons.length, 1)
  assert.match(v.reasons[0], /not a genuine/)
  assert.equal(v.details.authenticity.genuine, false)
})

test("a premium inside the warn band but under the block limit warns", () => {
  const v = assessGuard(
    base({ reference: { referencePrice: 100, tokenToShareRatio: 1, asOf: 0 }, spotUsdtPerToken: 103 }),
  )
  assert.equal(v.action, "warn")
  assert.equal(v.reasons.length, 1)
  assert.ok(v.details.premium && Math.abs(v.details.premium.premiumPct - 3) < 1e-9)
})

test("a premium at or over the block limit blocks the trade", () => {
  const v = assessGuard(
    base({ reference: { referencePrice: 100, tokenToShareRatio: 1, asOf: 0 }, spotUsdtPerToken: 110 }),
  )
  assert.equal(v.action, "block")
  assert.match(v.reasons[0], /blocked/)
})

test("slippage between the warn and resize limits warns", () => {
  const v = assessGuard(base({ buy: mkBuy({ slippagePct: 2, reliable: true }) }))
  assert.equal(v.action, "warn")
  assert.match(v.reasons[0], /slippage/)
})

test("slippage at or over the resize limit asks for a resize", () => {
  const v = assessGuard(
    base({ buy: mkBuy({ slippagePct: 4, reliable: true }), suggestedUsdtIn: 40 }),
  )
  assert.equal(v.action, "resize")
})

test("a pool with no fill is blocked", () => {
  const v = assessGuard(
    base({ buy: mkBuy({ reliable: false, tokensOut: 0, slippagePct: Number.POSITIVE_INFINITY }) }),
  )
  assert.equal(v.action, "block")
  assert.match(v.reasons[0], /no liquidity/)
})

test("a closed US session raises a stale-reference warning", () => {
  const v = assessGuard(base({ marketStatus: closedMarket() }))
  assert.equal(v.action, "warn")
  assert.equal(v.reasons.length, 1)
  assert.match(v.reasons[0], /closed/)
})

test("a spot read with no reference surfaces the skipped premium check as a warn", () => {
  const v = assessGuard(base({ spotUsdtPerToken: 100, referenceError: "feed down" }))
  assert.equal(v.action, "warn")
  assert.match(v.reasons[0], /skipped/)
  assert.equal(v.details.premiumError, "feed down")
})
