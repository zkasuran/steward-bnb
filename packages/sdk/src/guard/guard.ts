// The pre-trade guard entry point. Composes the on-chain reader (authenticity), the market module
// (spot price, depth/slippage, market hours) and the injected Web3ApiClient (reference price) into
// one verdict. Reads are plain BSC RPC and the reference call goes through whatever client is passed
// (a MockWeb3ApiClient in tests, no key). Nothing here signs, sends or spends.
import { getAddress, type Address, type PublicClient } from "viem"
import { isGenuineBStock, makeClient } from "../chain/bstocks.js"
import { USDT } from "../chain/constants.js"
import {
  getMarket,
  spotInQuote,
  quoteSlot,
  estimateUsdtBuy,
  marketHours,
  type PoolState,
  type BuyEstimate,
} from "../market/index.js"
import type { Web3ApiClient } from "../api/index.js"
import { assessGuard } from "./assess.js"
import { DEFAULT_GUARD_THRESHOLDS, type GuardThresholds, type GuardVerdict } from "./types.js"

export interface GuardTradeInput {
  // The bStock token being bought. Resolved by beacon, never by symbol.
  token: Address
  // USDT the buyer intends to spend. Depth/slippage is estimated for exactly this size.
  usdtIn: number
  // Reference-price source. Pass a MockWeb3ApiClient in tests, the real client once wired.
  api: Web3ApiClient
  // Now, for the market-hours check. Defaults to the wall clock.
  now?: Date
  // Reuse an existing client instead of the built-in endpoint. Optional.
  publicClient?: PublicClient
  // Symbol to look the reference price up under. Defaults to the pool's base symbol.
  symbol?: string
  // Quote token. Defaults to BSC USDT.
  quote?: Address
  // Override any of the default thresholds.
  thresholds?: Partial<GuardThresholds>
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * The largest USDT buy that keeps slippage under the resize limit on an already-read pool. Returns
 * undefined when no smaller size helps (a pool with no in-range liquidity). Pure: it re-estimates
 * against the pinned pool state with no further RPC, so the bisection is cheap.
 */
export function suggestSafeUsdtIn(
  state: PoolState,
  maxUsdtIn: number,
  thresholds: GuardThresholds,
  quote: Address = USDT,
): number | undefined {
  const feasible = (size: number): boolean => {
    if (!(size > 0)) return false
    let e: BuyEstimate
    try {
      e = estimateUsdtBuy(state, size, quote)
    } catch {
      return false
    }
    return e.reliable && e.slippagePct < thresholds.slippageResizePct
  }
  const tiny = Math.max(maxUsdtIn * 1e-6, 1e-9)
  // If even a dust-sized buy is not reliable, resizing cannot rescue this pool.
  if (!feasible(tiny)) return undefined
  let lo = tiny
  let hi = maxUsdtIn
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (feasible(mid)) lo = mid
    else hi = mid
  }
  return lo
}

function baseSymbol(state: PoolState, quote: Address): string {
  const { quoteIsToken0 } = quoteSlot(state, quote)
  return quoteIsToken0 ? state.symbol1 : state.symbol0
}

export async function guardTrade(input: GuardTradeInput): Promise<GuardVerdict> {
  const token = getAddress(input.token)
  const quote = input.quote ?? USDT
  const thresholds = { ...DEFAULT_GUARD_THRESHOLDS, ...input.thresholds }
  const marketStatus = marketHours(input.now ?? new Date())
  const client = input.publicClient ?? makeClient()

  // 1. AUTHENTICITY first. A scam clone blocks before any price is fetched, so a bad token never
  // triggers a reference-price call or a pool read.
  const genuine = await isGenuineBStock(client, token)
  if (!genuine) {
    return assessGuard({ token, usdtIn: input.usdtIn, quote, symbol: input.symbol, genuine: false, thresholds, marketStatus })
  }

  // 2 + 3. On-chain spot and the depth/slippage estimate come from one pinned pool read.
  let spotUsdtPerToken: number | undefined
  let buy: BuyEstimate | undefined
  let suggestedUsdtIn: number | undefined
  let marketError: string | undefined
  let atBlock: number | undefined
  let symbol = input.symbol

  try {
    const state = await getMarket(token, input.publicClient ? { quote, client: input.publicClient } : { quote })
    spotUsdtPerToken = spotInQuote(state, quote)
    atBlock = state.atBlock
    if (symbol === undefined) symbol = baseSymbol(state, quote)
    if (input.usdtIn > 0) {
      buy = estimateUsdtBuy(state, input.usdtIn, quote)
      if (!buy.reliable || buy.slippagePct >= thresholds.slippageWarnPct) {
        suggestedUsdtIn = suggestSafeUsdtIn(state, input.usdtIn, thresholds, quote)
      }
    }
  } catch (e) {
    marketError = errMsg(e)
  }

  // 2. Reference price for the premium-to-NAV check, through the injected client. A feed that is
  // down or not wired degrades to a skipped check, it does not crash the guard.
  let reference: { referencePrice: number; tokenToShareRatio: number; source?: string; asOf: number } | undefined
  let referenceError: string | undefined
  if (symbol !== undefined) {
    try {
      const ref = await input.api.getReferencePrice({ symbol })
      const referencePrice = Number(ref.referencePrice)
      const tokenToShareRatio = Number(ref.tokenToShareRatio)
      if (Number.isFinite(referencePrice) && Number.isFinite(tokenToShareRatio) && tokenToShareRatio > 0) {
        reference = { referencePrice, tokenToShareRatio, source: ref.source, asOf: ref.asOf }
      } else {
        referenceError = `reference feed returned non-numeric values (price=${ref.referencePrice}, ratio=${ref.tokenToShareRatio})`
      }
    } catch (e) {
      referenceError = errMsg(e)
    }
  } else {
    referenceError = "no token symbol available to look up the reference price"
  }

  return assessGuard({
    token,
    usdtIn: input.usdtIn,
    quote,
    symbol,
    genuine: true,
    thresholds,
    marketStatus,
    spotUsdtPerToken,
    reference,
    referenceError,
    buy,
    suggestedUsdtIn,
    marketError,
    atBlock,
  })
}
