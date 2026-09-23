// Intent: "is this AAPLB real". Resolve the token, read its EIP-1967 beacon slot once and decide
// genuineness by comparing to the official bStocks beacon. On-chain only, no key, no transaction.
import { BSTOCKS_BEACON, readBeacon, readTokenMeta } from "@steward/sdk"
import type { Address } from "viem"
import { resolveContext } from "../context.js"
import { resolveToken } from "../resolve.js"
import type { SkillContext, SkillResult } from "../types.js"

export interface AuthenticityData {
  token: Address
  symbol?: string
  genuine: boolean
  method: "eip1967-beacon"
  expectedBeacon: Address
  actualBeacon: Address | null
  name?: string
  onChainSymbol?: string
  decimals?: number
}

function unresolved(ref: string): SkillResult<AuthenticityData> {
  return {
    intent: "authenticity",
    ok: false,
    advisory: true,
    signed: false,
    headline: `Could not resolve "${ref}" to a token. Pass a bStocks symbol or a 0x address.`,
    detail: ["Steward checks authenticity by beacon, so it needs a concrete token address or a known bStocks symbol."],
    data: {
      token: "0x0000000000000000000000000000000000000000",
      genuine: false,
      method: "eip1967-beacon",
      expectedBeacon: BSTOCKS_BEACON,
      actualBeacon: null,
    },
    dataSource: "on-chain",
    notes: [],
  }
}

export async function checkAuthenticity(ref: string, ctx: SkillContext = {}): Promise<SkillResult<AuthenticityData>> {
  const resolved = resolveToken(ref)
  if (!resolved) return unresolved(ref)

  const rc = resolveContext(ctx)
  const actualBeacon = await readBeacon(rc.publicClient, resolved.address)
  // Mirrors the SDK's isGenuineBStock: genuine iff the beacon slot points at the official bStocks
  // beacon. Reuses the single beacon read for both the verdict and the displayed value.
  const genuine = actualBeacon !== null && actualBeacon.toLowerCase() === BSTOCKS_BEACON.toLowerCase()

  let name: string | undefined
  let onChainSymbol: string | undefined
  let decimals: number | undefined
  try {
    const meta = await readTokenMeta(rc.publicClient, resolved.address)
    name = meta.name
    onChainSymbol = meta.symbol
    decimals = meta.decimals
  } catch {
    // A token that does not answer ERC20 metadata still gets a genuineness verdict, which is the point.
  }

  const label = onChainSymbol ?? resolved.symbol ?? resolved.address
  const detail: string[] = []
  if (genuine) {
    detail.push(`${label} is a genuine bStocks stock token. Its proxy points at the official bStocks beacon ${BSTOCKS_BEACON}.`)
    if (name) detail.push(`On-chain name "${name}", symbol "${onChainSymbol}".`)
  } else if (actualBeacon === null) {
    detail.push(`${label} is not a bStocks beacon proxy. Its EIP-1967 beacon slot is empty, so it is not a genuine bStocks token. Treat it as a look-alike.`)
  } else {
    detail.push(`${label} is NOT genuine. Its proxy points at ${actualBeacon}, not the official bStocks beacon ${BSTOCKS_BEACON}. This is almost certainly a scam clone.`)
  }

  return {
    intent: "authenticity",
    ok: true,
    advisory: true,
    signed: false,
    headline: genuine ? `${label} is a genuine bStocks token.` : `${label} is NOT a genuine bStocks token.`,
    detail,
    data: {
      token: resolved.address,
      symbol: resolved.symbol ?? onChainSymbol,
      genuine,
      method: "eip1967-beacon",
      expectedBeacon: BSTOCKS_BEACON,
      actualBeacon,
      name,
      onChainSymbol,
      decimals,
    },
    dataSource: "on-chain",
    notes: [resolved.note],
  }
}
