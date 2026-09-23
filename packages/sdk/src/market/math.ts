// Pure PancakeSwap v3 price and swap math, no RPC. Kept separate so the arithmetic can be read
// and tested without a network. The conversions match PancakeSwap's own Explorer bit for bit on
// checked pools; the swap estimate is the single-range approximation described on estimateV3Out.

const TWO_96 = 2 ** 96

// Price per tick, from the v3 whitepaper section 6.1: price = 1.0001^tick.
export const TICK_BASE = 1.0001

// Raw token1-per-token0 ratio, before any decimals shift. Number(sqrtPriceX96) rounds to 53 bits
// so the answer carries about 16 significant digits, enough for a price or a slippage estimate.
// The whole tick range stays inside a double (about 2.9e-39 to 3.4e38), so there is no overflow at
// either end.
export function rawPrice(sqrtPriceX96: bigint | string): number {
  const r = Number(BigInt(sqrtPriceX96)) / TWO_96
  return r * r
}

// token1 per token0 in human units. On BSC nearly everything is 18 decimals so the factor is 1;
// it only matters the one time a pair is not, which is exactly when a hardcoded 1 is wrong.
export function price1Per0(sqrtPriceX96: bigint | string, decimals0: number, decimals1: number): number {
  return rawPrice(sqrtPriceX96) * 10 ** (decimals0 - decimals1)
}

// Price of the base token quoted in the quote token, decimals-correct, whichever slot each sits
// in. When the quote is token1 this is token1-per-token0 directly; when the quote is token0 it is
// the inverse.
export function priceInQuote(
  sqrtPriceX96: bigint | string,
  decimals0: number,
  decimals1: number,
  quoteIsToken0: boolean,
): number {
  const p = price1Per0(sqrtPriceX96, decimals0, decimals1)
  return quoteIsToken0 ? 1 / p : p
}

// Estimate the output of swapping amountInRaw of one token into a v3 pool, using the in-range
// constant-product approximation. It is exact while the price stays inside the current tick's
// liquidity, so it is accurate for trades small against pool depth and an approximation once the
// move is large enough to cross an initialized tick, which would need per-tick data this reader
// does not fetch. Fee is taken off the input first, the way the pool does it. Amounts are in raw
// smallest units. Returns the output in raw units and the post-trade sqrt price (sqrtPriceX96 / 2^96).
export function estimateV3Out(
  sqrtP: number,
  liquidity: number,
  feePpm: number,
  amountInRaw: number,
  inputIsToken0: boolean,
): { amountOutRaw: number; endSqrtP: number } {
  const afterFee = amountInRaw * (1 - feePpm / 1_000_000)
  if (inputIsToken0) {
    // Adding token0 pushes the price down and returns token1.
    const endSqrtP = (liquidity * sqrtP) / (liquidity + afterFee * sqrtP)
    return { amountOutRaw: liquidity * (sqrtP - endSqrtP), endSqrtP }
  }
  // Adding token1 pushes the price up and returns token0.
  const endSqrtP = sqrtP + afterFee / liquidity
  return { amountOutRaw: liquidity * (1 / sqrtP - 1 / endSqrtP), endSqrtP }
}
