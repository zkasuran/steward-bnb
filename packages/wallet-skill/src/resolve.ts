// Turn a user's reference (a bStocks symbol or a raw 0x address) into a token address and normalize a
// reference to a cross-provider underlying key. The golden rule holds: a symbol only ever produces a
// CANDIDATE address. Genuineness is always decided on-chain by the beacon at call time, never by a
// string here. No network, no key.
import { BSTOCKS_CANDIDATES, providers } from "@steward/sdk"
import type { Address } from "viem"

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

// bStocks symbol -> candidate address. QQQB is stored as QQQB_disputed in the SDK (a research flag);
// the runtime beacon check settles it, so it is exposed here under its plain symbol.
const BSTOCK_BY_SYMBOL: Record<string, Address> = {}
for (const [key, addr] of Object.entries(BSTOCKS_CANDIDATES)) {
  BSTOCK_BY_SYMBOL[key.replace(/_disputed$/i, "").toUpperCase()] = addr
}

export const KNOWN_BSTOCK_SYMBOLS: string[] = Object.keys(BSTOCK_BY_SYMBOL)
export const KNOWN_UNDERLYINGS: string[] = providers.KNOWN_UNDERLYINGS

export interface ResolvedToken {
  address: Address
  symbol?: string
  note: string
}

export function isAddress(s: string): boolean {
  return ADDRESS_RE.test(s.trim())
}

// Resolve a symbol or a raw address to a token address. A raw address is passed straight through. A
// known bStocks symbol maps to its candidate address, still verified live by beacon at call time. An
// underlying such as AAPL resolves to its bStocks token AAPLB, because this skill is bStocks-central.
export function resolveToken(ref: string): ResolvedToken | null {
  const raw = ref.trim()
  if (isAddress(raw)) {
    return {
      address: raw as Address,
      note: "raw address; genuineness is decided on-chain by the beacon, never by this string",
    }
  }
  const sym = raw.toUpperCase()
  if (BSTOCK_BY_SYMBOL[sym]) {
    return { address: BSTOCK_BY_SYMBOL[sym], symbol: sym, note: "candidate bStocks address, verified live by beacon at call time" }
  }
  const bSym = `${sym}B`
  if (BSTOCK_BY_SYMBOL[bSym]) {
    return { address: BSTOCK_BY_SYMBOL[bSym], symbol: bSym, note: `resolved underlying ${sym} to the bStocks token ${bSym}` }
  }
  return null
}

// Normalize a reference to a cross-provider underlying key (e.g. TSLAB or TSLA both become TSLA).
export function resolveUnderlying(ref: string): string {
  const key = ref.trim().toUpperCase()
  if (key.endsWith("B") && KNOWN_UNDERLYINGS.includes(key.slice(0, -1))) {
    return key.slice(0, -1)
  }
  return key
}
