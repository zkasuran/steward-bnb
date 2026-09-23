// The shipped example baskets and the validator that guards any basket before it is priced. Every
// ticker in these baskets is a genuine bStock in BSTOCKS_CANDIDATES; the beacon check at read time
// is what proves it on chain, this file only asserts the weights are well formed and the tickers
// are known. These are real, defensible theses, not filler: large-cap tech, an AI-compute tilt, and
// a broad-index pair.
import type { Basket } from "./types.js"
import { resolveTicker } from "./resolve.js"

// Default rebalance band. A leg is left alone until its weight drifts more than this many
// percentage points from target, the standard tolerance-band approach to rebalancing.
export const DEFAULT_DRIFT_THRESHOLD_PCT = 5

// Weights that sum this close to 1 are accepted, so a basket written with rounded fractions
// (0.2 is not exact in binary) is not rejected for a floating-point crumb.
export const WEIGHT_SUM_TOLERANCE = 1e-6

// Large-cap US tech, the bStock names of the "Magnificent Seven" story. AMZN and META have no
// bStock in the candidate set, so this is the five megacaps that do, tilted toward the largest.
export const MAG7_BASKET: Basket = {
  id: "mag7-ish",
  name: "Mag 7 (bStock large-cap tech)",
  description:
    "The Magnificent-Seven megacap tech names that trade as genuine bStocks: Apple, Microsoft, " +
    "Nvidia, Alphabet and Tesla, tilted toward the largest. Amazon and Meta are omitted because no " +
    "bStock exists for them in the verified candidate set.",
  weights: {
    AAPLB: 0.25,
    MSFTB: 0.25,
    NVDAB: 0.2,
    GOOGLB: 0.2,
    TSLAB: 0.1,
  },
}

// An AI-compute tilt: Nvidia as the only pure-semiconductor bStock, dominant, with the two megacaps
// whose earnings lean hardest on AI spend as the supporting legs. Stated honestly: MSFT and GOOGL
// are AI-exposed platforms, not chipmakers.
export const AI_CHIPS_BASKET: Basket = {
  id: "ai-chips",
  name: "AI chips (Nvidia-led)",
  description:
    "An AI-compute tilt led by Nvidia, the only pure semiconductor name with a genuine bStock, held " +
    "at a heavy weight. Microsoft and Alphabet round it out as the megacap platforms whose spend " +
    "drives AI demand; neither is a chipmaker, so they sit as supporting legs, not equals.",
  weights: {
    NVDAB: 0.6,
    MSFTB: 0.2,
    GOOGLB: 0.2,
  },
}

// The passive core: the S&P 500 and Nasdaq-100 index bStocks, split evenly. One holding for broad
// US equity beta without picking single names.
export const INDEX_BASKET: Basket = {
  id: "index",
  name: "Broad index (S&P 500 + Nasdaq 100)",
  description:
    "Passive US-equity beta through the two index bStocks, SPYB (S&P 500) and QQQB (Nasdaq 100), " +
    "split evenly. The all-market core to sit under the thematic tilts, no single-name risk.",
  weights: {
    SPYB: 0.5,
    QQQB: 0.5,
  },
}

export const EXAMPLE_BASKETS: readonly Basket[] = [MAG7_BASKET, AI_CHIPS_BASKET, INDEX_BASKET]

export const BASKETS_BY_ID: Record<string, Basket> = Object.fromEntries(
  EXAMPLE_BASKETS.map((b) => [b.id, b]),
)

// Sum of a basket's target weights. Pure, so it is cheap to assert in a test.
export function basketWeightSum(basket: Basket): number {
  return Object.values(basket.weights).reduce((s, w) => s + w, 0)
}

// Throw unless the basket is well formed: at least one leg, every weight finite and positive, every
// ticker a known bStock candidate, and the weights summing to 1 within WEIGHT_SUM_TOLERANCE. This
// runs before any priced analysis so a malformed basket fails loudly rather than producing silent
// nonsense weights.
export function validateBasket(basket: Basket): void {
  const entries = Object.entries(basket.weights)
  if (entries.length === 0) throw new Error(`basket "${basket.id}" has no weights`)
  for (const [ticker, weight] of entries) {
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`basket "${basket.id}" leg ${ticker} has a non-positive or non-finite weight ${weight}`)
    }
    if (!resolveTicker(ticker)) {
      throw new Error(`basket "${basket.id}" leg ${ticker} does not resolve to a known bStock`)
    }
  }
  const sum = basketWeightSum(basket)
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new Error(`basket "${basket.id}" weights sum to ${sum}, not ~1`)
  }
}
