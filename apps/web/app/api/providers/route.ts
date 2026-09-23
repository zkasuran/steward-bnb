// Cross-Provider: the same underlying equity across bStocks, Ondo and xStocks on BSC, read only.
// Each representation's authenticity is checked live (bStocks beacon, Ondo minter-role, Backed
// xStock heuristic) and priced from a real pool where one exists. The honest note ships in the
// body: a DEX arb across the three is NOT executable on today's BSC liquidity. No key, no tx.
import { providers } from "@steward/sdk"
import { BSC_CHAIN_ID } from "@/lib/format"
import { errorJson } from "@/lib/sdk-server"
import type { CompareResponse, RepresentationDTO } from "@/lib/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const underlying = url.searchParams.get("underlying")

  // No underlying: hand the client the roster it can offer for selection.
  if (!underlying) {
    return Response.json({ knownUnderlyings: providers.KNOWN_UNDERLYINGS })
  }

  try {
    const cmp = await providers.compareProviders(underlying)
    const representations: RepresentationDTO[] = cmp.representations.map((r) => ({
      family: r.family,
      address: r.address,
      name: r.name,
      symbol: r.symbol,
      authentic: r.authentic,
      authenticity: r.authenticity,
      spotUsdt: r.spotUsdt,
      pool: r.pool,
      poolUsdtReserve: r.poolUsdtReserve,
      atBlock: r.atBlock,
      tradeable: r.tradeable,
      depth: r.depth,
      liquidityNote: r.liquidityNote,
      provenance: r.provenance,
    }))
    const body: CompareResponse = {
      chainId: BSC_CHAIN_ID,
      underlying: cmp.underlying,
      arbitrageExecutable: false,
      honesty: cmp.honesty,
      representations,
    }
    return Response.json(body)
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : String(e), 502)
  }
}
