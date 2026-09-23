// KNOW / Fine Print: read a holder's balances across the known genuine bStocks plus a known
// scam clone, verify each by its on-chain beacon and return a plain "what you own" line per
// token. Reads run here on the server through viem, so the browser never touches an RPC and
// there is no CORS problem. Reference price and value are from the keyless mock feed, clearly
// labelled, until the human wires the Web3 API key.
import { formatUnits } from "viem"
import { makeClient, readHoldings, KNOWN_SCAM_CLONE, api } from "@steward/sdk"
import { BSC_CHAIN_ID } from "@/lib/format"
import { CANDIDATE_TOKENS, plainWhatYouOwn, parseAddress, errorJson } from "@/lib/sdk-server"
import type { HoldingDTO, HoldingsResponse } from "@/lib/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const holder = parseAddress(url.searchParams.get("address"))
  if (!holder) return errorJson("Pass a valid BSC holder address as ?address=0x…")

  try {
    const client = makeClient()
    const atBlock = Number(await client.getBlockNumber())

    // The genuine candidates first, then a known scam clone so the authenticity badge is shown
    // discriminating rather than passing everything.
    const roster = [
      ...CANDIDATE_TOKENS,
      { ticker: "CLONE", address: KNOWN_SCAM_CLONE },
    ]
    const holdings = await readHoldings(
      client,
      holder,
      roster.map((r) => r.address),
    )

    const mock = new api.MockWeb3ApiClient()
    const genuine: HoldingDTO[] = []
    const flagged: HoldingDTO[] = []

    for (let i = 0; i < holdings.length; i++) {
      const h = holdings[i]
      const ticker = roster[i].ticker
      const balanceHuman = formatUnits(h.balance, h.decimals)
      let refPriceMock: number | null = null
      let refValueMock: number | null = null
      if (h.genuine) {
        const ref = await mock.getReferencePrice({ symbol: h.symbol })
        refPriceMock = Number(ref.referencePrice)
        refValueMock = Number(balanceHuman) * refPriceMock
      }
      const dto: HoldingDTO = {
        ticker,
        symbol: h.symbol,
        name: h.name,
        address: h.address,
        genuine: h.genuine,
        decimals: h.decimals,
        balanceHuman,
        balanceRaw: h.balance.toString(),
        totalSupplyHuman: formatUnits(h.totalSupply, h.decimals),
        plainWhatYouOwn: plainWhatYouOwn(ticker, h.symbol, h.genuine),
        refPriceMock,
        refValueMock,
      }
      if (h.genuine) genuine.push(dto)
      else flagged.push(dto)
    }

    // Holdings you actually carry sort to the top; empty genuine tokens stay listed so the
    // authenticity check is visible even at an address that holds none of them.
    genuine.sort((a, b) => Number(b.balanceHuman) - Number(a.balanceHuman))

    const body: HoldingsResponse = {
      chainId: BSC_CHAIN_ID,
      atBlock,
      holder,
      holdings: genuine,
      flagged,
      referenceIsMock: true,
    }
    return Response.json(body)
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : String(e), 502)
  }
}
