// Server-only helpers shared by the route handlers. Imports @steward/sdk and viem, so this
// must never be pulled into a client component. It turns the SDK constants into a clean token
// roster and writes the plain-English "what you own" line the Fine Print section shows.
import { isAddress, getAddress, type Address } from "viem"
import { BSTOCKS_CANDIDATES } from "@steward/sdk"

// The candidate roster with a clean ticker label (the QQQB key carries a "_disputed" suffix,
// stripped here; the on-chain beacon check settles authenticity at read time regardless).
export interface CandidateToken {
  ticker: string
  address: Address
}

export const CANDIDATE_TOKENS: CandidateToken[] = Object.entries(BSTOCKS_CANDIDATES).map(
  ([key, address]) => ({ ticker: key.split("_")[0].toUpperCase(), address: getAddress(address) }),
)

// Underlying names for readable copy. These are the equity each bStock ticker tracks by name;
// the on-chain fact we assert is authenticity by beacon, never the backing, which is the issuer's.
const UNDERLYING_NAMES: Record<string, string> = {
  AAPL: "Apple",
  NVDA: "Nvidia",
  TSLA: "Tesla",
  MSFT: "Microsoft",
  GOOGL: "Alphabet",
  SPY: "the S&P 500 index",
  QQQ: "the Nasdaq 100 index",
}

export function underlyingOf(ticker: string): string {
  const base = ticker.toUpperCase().replace(/B$/, "")
  return base
}

export function underlyingName(ticker: string): string {
  return UNDERLYING_NAMES[underlyingOf(ticker)] ?? underlyingOf(ticker)
}

// Plain line for a holding, grounded in what is verified on chain. Authenticity is a fact
// (the beacon check). Backing and redemption are the issuer's terms, so they are named as the
// product's design, not asserted as verified here.
export function plainWhatYouOwn(ticker: string, symbol: string, genuine: boolean): string {
  if (!genuine) {
    return (
      `This token is NOT a genuine bStocks stock token. Its on-chain proxy does not point at the ` +
      `official bStocks beacon, so it is almost certainly a scam look-alike. Its balance is not ` +
      `trusted and is shown as zero.`
    )
  }
  const name = underlyingName(ticker)
  return (
    `A genuine bStocks token, verified by its on-chain beacon. It tracks ${name} as a tokenized ` +
    `stock on BNB Smart Chain. bStocks are designed to be 1:1 backed and redeemable with the ` +
    `issuer; those terms are set by the issuer and are not verified on chain here.`
  )
}

// Validate and checksum an address; return null when it is not one. Route handlers turn null into a 400.
export function parseAddress(a: string | null): Address | null {
  if (!a) return null
  const t = a.trim()
  return isAddress(t, { strict: false }) ? getAddress(t) : null
}

// A stable JSON error response.
export function errorJson(message: string, status = 400): Response {
  return Response.json({ error: message }, { status })
}
