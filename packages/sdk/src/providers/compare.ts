// compareProviders: read-only, same underlying equity across the three families on BSC.
//
// This is a comparison and honesty surface, NOT an execution path. A DEX arbitrage across the bStocks,
// Ondo and xStocks representations of one equity is not executable on today's open BSC liquidity:
// bStocks trades with real depth, Ondo pools are thin, xStocks pools are dust or absent (measured
// 2026-09-19). `arbitrageExecutable` is a literal false and the honesty note ships in the returned
// data, so a consumer cannot render this as a tradeable spread by accident. Reads only; no key, no tx.
import { erc20Abi, getAddress, isAddressEqual, type Address, type PublicClient } from "viem"
import { USDT } from "../chain/constants.js"
import { isGenuineBStock } from "../chain/bstocks.js"
import { getMarket, spotInQuote, withRpc } from "../market/index.js"
import { CROSS_PROVIDER_REGISTRY, type ProviderFamily, type RegistryListing } from "./constants.js"
import { isOndoToken, isXStock } from "./detect.js"

// How deep the family's BSC secondary market is. "none" means an authentic token with no v3 USDT pool.
export type Depth = "deep" | "thin" | "dust" | "none"

export interface ProviderRepresentation {
  family: ProviderFamily
  address: Address
  name: string | null
  symbol: string | null
  decimals: number | null
  // Authenticity, checked live against the family's anchor (beacon / minter-role / Backed heuristic).
  authentic: boolean
  authenticity: string
  // On-chain spot in USDT via the deepest PancakeSwap v3 USDT pool. Null when no such pool exists.
  spotUsdt: number | null
  pool: Address | null
  // USDT-side balance of that pool, a live depth proxy. Null when unpriced.
  poolUsdtReserve: number | null
  atBlock: number | null
  priceNote: string
  // True only for a genuine bStock that a real pool prices. Ondo and xStocks are never tradeable in
  // size on BSC and are always false here, whatever a thin pool might momentarily quote.
  tradeable: boolean
  depth: Depth
  liquidityNote: string
  provenance: string
}

export interface CrossProviderComparison {
  underlying: string
  quote: Address
  representations: ProviderRepresentation[]
  // Always false. Kept as a literal so a UI binds to it directly instead of re-deriving it.
  arbitrageExecutable: false
  honesty: string
  readAt: number
}

export interface CompareOptions {
  // Quote token for the price leg. Defaults to BSC USDT.
  quote?: Address
  // Read through this client instead of the built-in endpoint fallback (e.g. one on a bulk endpoint).
  client?: PublicClient
}

// Family-level liquidity truth on BSC, from the 2026-09-19 measurements. bStocks depth is refined per
// token by whether a live pool actually prices it; Ondo and xStocks are thin/dust across the board.
const FAMILY_LIQUIDITY: Record<ProviderFamily, { depth: Depth; note: string }> = {
  bStocks: {
    depth: "deep",
    note: "bStocks has real PancakeSwap v3 depth on BSC (NVDAB ~$2.7M pool TVL, ~0.29% all-in on a $10k buy, measured 2026-09-19).",
  },
  ondo: {
    depth: "thin",
    note: "Ondo secondary liquidity on BSC is thin (single-digit-thousands to ~$15k per pool, mostly v2 or non-USDT pairs, measured 2026-09-19), so it is not tradeable in size here.",
  },
  xStocks: {
    depth: "dust",
    note: "xStocks (Backed Finance) has dust or no BSC DEX liquidity; its real markets are Solana and X Layer, so it is not tradeable on BSC.",
  },
}

export const CROSS_PROVIDER_HONESTY =
  "Read-only comparison and honesty surface, not an execution path. A DEX arbitrage across the bStocks, " +
  "Ondo and xStocks representations of the same equity is NOT executable on today's open BSC liquidity: " +
  "bStocks trades with real depth, but Ondo pools are thin and xStocks pools are dust or absent on BSC " +
  "(measured 2026-09-19). Any price gap shown here is informational only. Do not route a trade or an arb " +
  "through it."

async function checkAuthentic(
  client: PublicClient,
  listing: RegistryListing,
): Promise<{ authentic: boolean; authenticity: string }> {
  if (listing.anchor === "beacon") {
    const ok = await isGenuineBStock(client, listing.address)
    return { authentic: ok, authenticity: ok ? "beacon-verified genuine bStock" : "FAILED bStocks beacon check" }
  }
  if (listing.anchor === "minter-role") {
    const ok = await isOndoToken(client, listing.address)
    return { authentic: ok, authenticity: ok ? "Ondo MINTER_ROLE bind verified live" : "FAILED Ondo MINTER_ROLE check" }
  }
  const ok = await isXStock(client, listing.address)
  return {
    authentic: ok,
    authenticity: ok
      ? "Backed xStock heuristic matched (terms/allowlist), not a cryptographic bind"
      : "did not match the Backed xStock heuristic",
  }
}

async function readMeta(
  client: PublicClient,
  address: Address,
): Promise<{ name: string | null; symbol: string | null; decimals: number | null }> {
  const r = await client.multicall({
    contracts: [
      { address, abi: erc20Abi, functionName: "name" },
      { address, abi: erc20Abi, functionName: "symbol" },
      { address, abi: erc20Abi, functionName: "decimals" },
    ],
    allowFailure: true,
  })
  return {
    name: r[0].status === "success" ? r[0].result : null,
    symbol: r[1].status === "success" ? r[1].result : null,
    decimals: r[2].status === "success" ? r[2].result : null,
  }
}

interface PriceRead {
  spotUsdt: number | null
  pool: Address | null
  poolUsdtReserve: number | null
  atBlock: number | null
  priceNote: string
}

// Price via the market module's deepest PancakeSwap v3 USDT pool. A family with no v3 USDT pool (Ondo
// pools are mostly v2/non-USDT, xStocks are dust) resolves to a null price with the reason kept.
async function readPrice(address: Address, quote: Address, client?: PublicClient): Promise<PriceRead> {
  try {
    const state = await getMarket(address, client ? { quote, client } : { quote })
    const spot = spotInQuote(state, quote)
    const poolUsdtReserve = isAddressEqual(state.token0, quote) ? state.reserve0Human : state.reserve1Human
    return {
      spotUsdt: spot,
      pool: state.pool,
      poolUsdtReserve,
      atBlock: state.atBlock,
      priceNote: `PancakeSwap v3 pool ${state.pool}, fee ${state.fee}, block ${state.atBlock}`,
    }
  } catch (e) {
    return {
      spotUsdt: null,
      pool: null,
      poolUsdtReserve: null,
      atBlock: null,
      priceNote: `no PancakeSwap v3 USDT pool resolved: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`,
    }
  }
}

async function readRepresentation(
  listing: RegistryListing,
  quote: Address,
  client?: PublicClient,
): Promise<ProviderRepresentation> {
  const address = getAddress(listing.address)
  const run = async (c: PublicClient) => {
    const [auth, meta] = await Promise.all([checkAuthentic(c, listing), readMeta(c, address)])
    return { auth, meta }
  }
  const { auth, meta } = client ? await run(client) : await withRpc(run)
  const price = await readPrice(address, quote, client)

  const fam = FAMILY_LIQUIDITY[listing.family]
  const pricedByPool = price.spotUsdt !== null
  // Only a genuine bStock priced by a real pool is tradeable. Ondo/xStocks stay false by family truth.
  const tradeable = auth.authentic && listing.family === "bStocks" && pricedByPool
  let depth: Depth
  let liquidityNote: string
  if (!auth.authentic) {
    depth = "none"
    liquidityNote = "authenticity check failed, so liquidity is not assessed"
  } else if (listing.family === "bStocks") {
    depth = pricedByPool ? "deep" : "none"
    liquidityNote = pricedByPool
      ? fam.note
      : "genuine bStock but no PancakeSwap v3 USDT pool resolved at read time, so depth is not established here"
  } else {
    depth = fam.depth
    liquidityNote = fam.note
  }

  return {
    family: listing.family,
    address,
    name: meta.name,
    symbol: meta.symbol,
    decimals: meta.decimals,
    authentic: auth.authentic,
    authenticity: auth.authenticity,
    spotUsdt: price.spotUsdt,
    pool: price.pool,
    poolUsdtReserve: price.poolUsdtReserve,
    atBlock: price.atBlock,
    priceNote: price.priceNote,
    tradeable,
    depth,
    liquidityNote,
    provenance: listing.reverified ? listing.source : `${listing.source} (NOT re-derived this session; verified live at call time)`,
  }
}

// Compare every family's representation of one underlying (e.g. "TSLA") on BSC. Returns each token's
// address, live authenticity, on-chain USDT spot where a pool exists and an honest tradeable flag.
// Unknown underlyings return an empty representation list, never an error.
export async function compareProviders(
  underlying: string,
  opts: CompareOptions = {},
): Promise<CrossProviderComparison> {
  const key = underlying.trim().toUpperCase()
  const quote = opts.quote ?? USDT
  const listings = CROSS_PROVIDER_REGISTRY[key] ?? []
  const representations = await Promise.all(listings.map((l) => readRepresentation(l, quote, opts.client)))
  return {
    underlying: key,
    quote,
    representations,
    arbitrageExecutable: false,
    honesty: CROSS_PROVIDER_HONESTY,
    readAt: Date.now(),
  }
}
