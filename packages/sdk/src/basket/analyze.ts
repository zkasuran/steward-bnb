// Analyse a basket against a holder's wallet: read the real holdings (beacon-checked), price each
// leg in USDT, and derive portfolio value, current weights and drift versus the target weights.
// The pure core (basketStateFromLegs) does the arithmetic with no network, so the weight and drift
// math is deterministic and unit-testable; analyzeBasket is the thin reader that feeds it live data.
// Every read here is a free BSC RPC call: no Binance Web3 API key, and nothing signs or sends.
import { formatUnits, type Address } from "viem"
import { readHoldings } from "../chain/bstocks.js"
import { USDT } from "../chain/constants.js"
import { getMarket, spotInQuote, withRpc } from "../market/index.js"
import { validateBasket } from "./baskets.js"
import { resolveTicker } from "./resolve.js"
import type { AnalyzeOptions, Basket, BasketLegInput, BasketLegState, BasketState } from "./types.js"

// Build the priced state from already-resolved legs. Pure: no RPC, so a synthetic set of holdings
// proves the weight and drift math without a network. `driftPct = (currentWeight - targetWeight) *
// 100`, in percentage points, positive for overweight.
export function basketStateFromLegs(
  basket: Basket,
  legs: BasketLegInput[],
  meta: { holder?: Address | null; atBlock?: number | null } = {},
): BasketState {
  const valued = legs.map((l) => {
    const units = Number(formatUnits(l.balance, l.decimals))
    const valueUsd = l.priceUsd == null ? 0 : units * l.priceUsd
    return { leg: l, units, valueUsd }
  })
  const portfolioValueUsd = valued.reduce((s, v) => s + v.valueUsd, 0)
  // A leg that holds a balance but has no price makes the total and every weight untrustworthy.
  const complete = valued.every((v) => !(v.leg.balance > 0n) || v.leg.priceUsd != null)

  const stateLegs: BasketLegState[] = valued.map(({ leg, units, valueUsd }) => {
    const targetWeight = basket.weights[leg.ticker] ?? 0
    const currentWeight = portfolioValueUsd > 0 ? valueUsd / portfolioValueUsd : 0
    return {
      ticker: leg.ticker,
      token: leg.token,
      genuine: leg.genuine,
      decimals: leg.decimals,
      balance: leg.balance,
      units,
      priceUsd: leg.priceUsd,
      valueUsd,
      targetWeight,
      currentWeight,
      driftPct: (currentWeight - targetWeight) * 100,
    }
  })

  return {
    basketId: basket.id,
    name: basket.name,
    holder: meta.holder ?? null,
    legs: stateLegs,
    portfolioValueUsd,
    complete,
    readAt: Date.now(),
    atBlock: meta.atBlock ?? null,
  }
}

// Read a holder's position in a basket and price it. Resolves every ticker to its address, reads
// balances with a per-token beacon check (readHoldings), then prices each genuine leg: from the
// supplied priceFn when given, otherwise from the deepest bStock/USDT PancakeSwap v3 pool. A held
// leg that cannot be priced leaves its price null and marks the state incomplete rather than
// pretending a value; a zero-balance leg that cannot be priced is harmless (its value is 0 anyway).
export async function analyzeBasket(
  basket: Basket,
  holder: Address,
  opts: AnalyzeOptions = {},
): Promise<BasketState> {
  validateBasket(basket)
  const quote = opts.quote ?? USDT
  const tickers = Object.keys(basket.weights)
  const tokens = tickers.map((t) => {
    const token = resolveTicker(t)
    if (!token) throw new Error(`unknown bStock ticker "${t}" in basket "${basket.id}"`)
    return token
  })

  // Holdings under the module's own endpoint fallback, with the block recorded for the report.
  const { holdings, atBlock } = await withRpc(async (client) => {
    const block = await client.getBlockNumber()
    const read = await readHoldings(client, holder, tokens)
    return { holdings: read, atBlock: Number(block) }
  })

  const legs: BasketLegInput[] = []
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]
    const token = tokens[i]
    const h = holdings[i]
    let priceUsd: number | null = null

    if (opts.priceFn) {
      priceUsd = await opts.priceFn({ ticker, token })
    } else if (h.genuine) {
      try {
        const state = await getMarket(token, { quote, client: opts.client })
        priceUsd = spotInQuote(state, quote)
      } catch {
        // No USDT pool or a failed read. Left null; the state is marked incomplete only if this leg
        // actually holds a balance, so an empty leg with no pool does not spoil the analysis.
        priceUsd = null
      }
    }

    legs.push({ ticker, token, genuine: h.genuine, decimals: h.decimals, balance: h.balance, priceUsd })
  }

  return basketStateFromLegs(basket, legs, { holder, atBlock })
}
