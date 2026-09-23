// Expected slippage for buying a bStock with USDT on a PancakeSwap v3 pool. The estimate uses the
// in-range constant-product math (see estimateV3Out): exact for trades small against pool depth, an
// approximation once the move is large enough to cross an initialized tick, which this read-only
// module flags rather than pretends away. Nothing here signs or sends; it only reads and computes.
import { isAddressEqual, type Address } from "viem"
import { USDT } from "../chain/constants.js"
import { estimateV3Out } from "./math.js"
import { getMarket, quoteSlot, type MarketOptions, type PoolState } from "./pool.js"

// Above this estimated price impact the single-range assumption is unreliable, because a move that
// large is likely to cross into the next tick where liquidity differs and this reader has not read
// per-tick data. A heuristic, not a pool constant, so it is named and can be tuned.
const SINGLE_RANGE_RELIABLE_PCT = 2

export interface BuyEstimate {
  pool: Address
  base: Address
  quote: Address
  symbolBase: string
  symbolQuote: string
  // Requested USDT input, human units.
  usdtIn: number
  // Pool fee in parts per million, and the fee portion of the input in USDT.
  feePpm: number
  feePaidUsdt: number
  // Estimated bStock received, human units.
  tokensOut: number
  // USDT per bStock actually paid on average across the trade.
  executionPrice: number
  // USDT per bStock at the pool's price before the trade.
  spotPrice: number
  // USDT per bStock at the pool's marginal price after the trade.
  endPrice: number
  // All-in slippage: executionPrice / spotPrice - 1, in percent, LP fee included. This is how much
  // worse than spot the average fill is, the number a buyer actually feels. Non-negative for a buy.
  slippagePct: number
  // Pure curve movement: endPrice / spotPrice - 1, in percent, fee-free. How far the buy pushes the
  // pool's own price. Separate from the fee, so a 1% fee pool does not read as 1% of price impact.
  priceMovePct: number
  // False when the estimate should not be trusted: no liquidity, the size exceeds pool balances, or
  // the curve move is large enough that tick crossing makes the single-range math unreliable.
  reliable: boolean
  note: string
  atBlock: number
}

// Estimate a USDT buy against an already-read pool state. Pure: no RPC, so it is cheap to sweep
// many sizes against one block's state and it unit-tests without a network.
export function estimateUsdtBuy(state: PoolState, usdtIn: number, quote: Address = USDT): BuyEstimate {
  if (!(usdtIn > 0)) throw new Error(`usdtIn must be positive, got ${usdtIn}`)
  const { quoteIsToken0 } = quoteSlot(state, quote)

  const decimalsQuote = quoteIsToken0 ? state.decimals0 : state.decimals1
  const decimalsBase = quoteIsToken0 ? state.decimals1 : state.decimals0
  const base = quoteIsToken0 ? state.token1 : state.token0
  const symbolBase = quoteIsToken0 ? state.symbol1 : state.symbol0
  const symbolQuote = quoteIsToken0 ? state.symbol0 : state.symbol1
  const baseReserveHuman = quoteIsToken0 ? state.reserve1Human : state.reserve0Human

  const spotPrice = quoteIsToken0 ? 1 / state.price1Per0 : state.price1Per0
  const feePaidUsdt = usdtIn * (state.fee / 1_000_000)

  const liquidity = Number(BigInt(state.liquidity))
  const base0: Partial<BuyEstimate> = {
    pool: state.pool,
    base,
    quote,
    symbolBase,
    symbolQuote,
    usdtIn,
    feePpm: state.fee,
    feePaidUsdt,
    spotPrice,
    atBlock: state.atBlock,
  }

  if (!(liquidity > 0)) {
    return {
      ...(base0 as BuyEstimate),
      tokensOut: 0,
      executionPrice: Number.POSITIVE_INFINITY,
      endPrice: spotPrice,
      slippagePct: Number.POSITIVE_INFINITY,
      priceMovePct: 0,
      reliable: false,
      note: "pool has zero in-range liquidity at this block, so no fill is possible here",
    }
  }

  const sqrtP = Number(BigInt(state.sqrtPriceX96)) / 2 ** 96
  const amountInRaw = usdtIn * 10 ** decimalsQuote
  // USDT is the input, and it is token0 exactly when the quote is token0.
  const { amountOutRaw, endSqrtP } = estimateV3Out(sqrtP, liquidity, state.fee, amountInRaw, quoteIsToken0)
  const tokensOut = amountOutRaw / 10 ** decimalsBase
  const executionPrice = usdtIn / tokensOut
  const endRaw = endSqrtP * endSqrtP * 10 ** (state.decimals0 - state.decimals1)
  const endPrice = quoteIsToken0 ? 1 / endRaw : endRaw
  const slippagePct = (executionPrice / spotPrice - 1) * 100
  // The curve move gates single-range reliability, not the fee: a high-fee pool has large slippage
  // on a tiny trade that never crosses a tick, so gating on slippage would wrongly flag it.
  const priceMovePct = (endPrice / spotPrice - 1) * 100

  let reliable = true
  let note = "in-range estimate; accurate while the price stays inside the current tick"
  if (!Number.isFinite(tokensOut) || tokensOut <= 0) {
    reliable = false
    note = "estimate did not produce a positive output; treat as no fill"
  } else if (tokensOut > baseReserveHuman) {
    reliable = false
    note = `estimated out ${tokensOut} ${symbolBase} exceeds the pool's ${baseReserveHuman} ${symbolBase} balance, so this size cannot fill here`
  } else if (priceMovePct > SINGLE_RANGE_RELIABLE_PCT) {
    reliable = false
    note = `curve move ${priceMovePct.toFixed(2)}% is past the ${SINGLE_RANGE_RELIABLE_PCT}% single-range bound; the true fill likely crosses ticks, so treat this slippage as a floor`
  }

  return {
    ...(base0 as BuyEstimate),
    tokensOut,
    executionPrice,
    endPrice,
    slippagePct,
    priceMovePct,
    reliable,
    note,
  }
}

// One call from a bStock token to a USDT-buy estimate: resolve the deepest pool, read it, and
// compute the slippage. Manages its own endpoint fallback unless a client is passed in opts.
export async function quoteUsdtBuy(
  token: Address,
  usdtIn: number,
  opts: MarketOptions = {},
): Promise<BuyEstimate> {
  const state = await getMarket(token, opts)
  return estimateUsdtBuy(state, usdtIn, opts.quote ?? USDT)
}

// Convenience guard used by the pre-trade checks: is `quote` one leg of this pool at all.
export function pairsQuote(state: PoolState, quote: Address = USDT): boolean {
  return isAddressEqual(state.token0, quote) || isAddressEqual(state.token1, quote)
}
