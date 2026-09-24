// KNOW / Fine Print: read a holder's balances across the known genuine bStocks plus a known
// scam clone, verify each by its on-chain beacon and return a plain "what you own" line per
// token. Reads run here on the server through viem, so the browser never touches an RPC and
// there is no CORS problem. Reference price and value come from the live Binance RWA feed when the
// Web3 API key is set (mapped to the feed's own token address). It uses the labelled mock otherwise.
// A ticker the RWA feed does not list falls back to the on-chain price, marked. It is never faked.
import { formatUnits } from "viem"
import { makeClient, readHoldings, KNOWN_SCAM_CLONE } from "@steward/sdk"
import { createReferenceClient, ReferenceUnavailableError } from "@/lib/reference"
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

    const { client: refClient, mode } = createReferenceClient()
    const genuine: HoldingDTO[] = []
    const flagged: HoldingDTO[] = []

    for (let i = 0; i < holdings.length; i++) {
      const h = holdings[i]
      const ticker = roster[i].ticker
      const balanceHuman = formatUnits(h.balance, h.decimals)
      const balance = Number(balanceHuman)

      let refPrice: number | null = null
      let tokenToShareRatio: number | null = null
      let refValue: number | null = null
      let referenceAvailable = false
      let referenceNote: string | null = null
      let refSource: string | null = null
      let refAsOf: number | null = null
      let onchainPrice: number | null = null
      let onchainValue: number | null = null

      if (h.genuine) {
        try {
          const ref = await refClient.getReferencePrice({ symbol: h.symbol, tokenContractAddress: h.address })
          refPrice = Number(ref.referencePrice)
          const ratio = Number(ref.tokenToShareRatio)
          tokenToShareRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : null
          // Value in share terms: one token is tokenToShareRatio shares and refPrice is per share.
          refValue = Number.isFinite(refPrice) ? balance * refPrice * (tokenToShareRatio ?? 1) : null
          referenceAvailable = true
          refSource = ref.source ?? null
          refAsOf = ref.asOf ?? null
        } catch (e) {
          referenceNote =
            e instanceof ReferenceUnavailableError
              ? e.message
              : `Reference price unavailable (${e instanceof Error ? e.message : String(e)}).`
          // Degrade to the on-chain price so the holding still carries a number, marked on-chain.
          try {
            const p = await refClient.getPrice({ symbol: h.symbol, tokenContractAddress: h.address })
            onchainPrice = Number(p.price)
            onchainValue = Number.isFinite(onchainPrice) ? balance * onchainPrice : null
          } catch {
            onchainPrice = null
            onchainValue = null
          }
        }
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
        refPrice,
        tokenToShareRatio,
        refValue,
        referenceAvailable,
        referenceNote,
        refSource,
        refAsOf,
        onchainPrice,
        onchainValue,
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
      referenceMode: mode,
    }
    return Response.json(body)
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : String(e), 502)
  }
}
