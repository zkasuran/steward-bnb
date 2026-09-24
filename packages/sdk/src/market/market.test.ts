// Deterministic unit tests for the pure PancakeSwap v3 math: the sqrtPriceX96 to spot conversions and
// the single-range swap-out estimate. No RPC: sqrtPriceX96 is constructed so the expected price is
// hand-derivable; the swap output is checked against a value computed by hand in the comments.
import { test } from "node:test"
import assert from "node:assert/strict"
import { rawPrice, price1Per0, priceInQuote, estimateV3Out } from "./math.js"

const Q96 = 2n ** 96n // sqrtPriceX96 for a raw price of exactly 1
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`)

test("rawPrice squares sqrtPriceX96 / 2^96", () => {
  // sqrtP = 1 -> price 1; sqrtP = 2 (sqrtPriceX96 = 2 * 2^96) -> price 4.
  assert.equal(rawPrice(Q96), 1)
  assert.equal(rawPrice(2n * Q96), 4)
})

test("price1Per0 applies the decimals shift", () => {
  // raw 1 with an 18/6 decimals gap scales by 10^(18-6) = 1e12.
  near(price1Per0(Q96, 18, 6), 1e12)
  // equal decimals leave the raw price unchanged.
  near(price1Per0(2n * Q96, 18, 18), 4)
})

test("priceInQuote inverts when the quote is token0", () => {
  near(priceInQuote(2n * Q96, 18, 18, false), 4)
  near(priceInQuote(2n * Q96, 18, 18, true), 0.25)
})

test("estimateV3Out (token0 in) returns the in-range output and pushes price down", () => {
  // afterFee 100, endSqrtP = 1000*1/(1000+100) = 0.90909..., out = 1000*(1 - 0.90909) = 90.90909...
  const { amountOutRaw, endSqrtP } = estimateV3Out(1, 1000, 0, 100, true)
  near(amountOutRaw, 90.9090909090909, 1e-6)
  assert.ok(endSqrtP < 1, `${endSqrtP} should be below the 1.0 start`)
})

test("the LP fee is taken off the input, so a fee pool returns strictly less", () => {
  const noFee = estimateV3Out(1, 1000, 0, 100, true).amountOutRaw
  const withFee = estimateV3Out(1, 1000, 3000, 100, true).amountOutRaw // 0.3%
  assert.ok(withFee > 0)
  assert.ok(withFee < noFee, `${withFee} should be below the no-fee ${noFee}`)
})

test("estimateV3Out (token1 in) returns token0 and pushes price up", () => {
  // endSqrtP = 1 + 100/1000 = 1.1, out = 1000*(1/1 - 1/1.1) = 90.90909...
  const { amountOutRaw, endSqrtP } = estimateV3Out(1, 1000, 0, 100, false)
  near(amountOutRaw, 90.9090909090909, 1e-6)
  assert.ok(endSqrtP > 1, `${endSqrtP} should be above the 1.0 start`)
})
