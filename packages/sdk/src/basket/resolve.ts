// Resolve a bStock ticker to its address and beacon-check it. The one rule of this SDK holds here:
// a token is trusted only when its EIP-1967 beacon slot points at the bStocks beacon, never because
// its symbol reads "AAPLB". So a basket's tickers are first mapped to the addresses sighted in
// BSTOCKS_CANDIDATES, then every address is beacon-checked live before a balance is trusted.
import { getAddress, type Address, type PublicClient } from "viem"
import { isGenuineBStock } from "../chain/bstocks.js"
import { BSTOCKS_CANDIDATES } from "../chain/constants.js"
import { withRpc } from "../market/index.js"

// Normalise BSTOCKS_CANDIDATES into a plain ticker -> address map. Some keys carry a status suffix
// (QQQB is keyed "QQQB_disputed" because one research pass flagged its on-chain name; the beacon
// check settles it empirically), so the segment before the first underscore is the ticker.
export const BASKET_TICKERS: Record<string, Address> = Object.fromEntries(
  Object.entries(BSTOCKS_CANDIDATES).map(([key, addr]) => [key.split("_")[0].toUpperCase(), getAddress(addr)]),
)

// The address for a ticker, or null when the ticker is not a known bStock candidate. Case-insensitive.
export function resolveTicker(ticker: string): Address | null {
  return BASKET_TICKERS[ticker.trim().toUpperCase()] ?? null
}

export interface ResolvedTicker {
  ticker: string
  token: Address
  // The result of the live beacon check: true only when the token's beacon slot is the bStocks beacon.
  genuine: boolean
}

// Resolve every ticker of a basket to its address and beacon-check each one live, reusing a single
// client across all the checks. A ticker that does not resolve throws, because a basket weighting an
// unknown symbol is a malformed basket, not a zero-weight leg.
export async function resolveBasketTokens(
  weights: Record<string, number>,
  client?: PublicClient,
): Promise<ResolvedTicker[]> {
  const tickers = Object.keys(weights)
  const tokens = tickers.map((t) => {
    const token = resolveTicker(t)
    if (!token) throw new Error(`unknown bStock ticker "${t}": not in BSTOCKS_CANDIDATES`)
    return token
  })
  const check = async (c: PublicClient): Promise<ResolvedTicker[]> => {
    const out: ResolvedTicker[] = []
    for (let i = 0; i < tickers.length; i++) {
      const genuine = await isGenuineBStock(c, tokens[i])
      out.push({ ticker: tickers[i], token: tokens[i], genuine })
    }
    return out
  }
  return client ? check(client) : withRpc(check)
}
