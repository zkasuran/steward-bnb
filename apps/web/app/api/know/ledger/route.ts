// KNOW / True-Position Ledger: reconstruct a holder's position in one bStock from on-chain
// Transfer logs, detect the dividend/split rebase that changed the balance with no transfer
// (the "you were not hacked" moment) and value the live balance from the on-chain pool.
// Cost basis at each acquisition needs a historical price feed, so it is left unpriced and
// said so, rather than faked. Server-side reads only, no key, no transaction, no spend.
import { formatUnits, parseUnits, type Address } from "viem"
import { makeClient, ledger, market } from "@steward/sdk"
import { BSC_CHAIN_ID } from "@/lib/format"
import { parseAddress, errorJson } from "@/lib/sdk-server"
import type { CorporateActionDTO, LedgerResponse, TransferDTO } from "@/lib/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DEFAULT_LOOKBACK = 120_000n // ~1 day of BSC blocks; a gentle default the user can widen
const MAX_LOOKBACK = 6_000_000n
const USDT_DECIMALS = 18

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const holder = parseAddress(url.searchParams.get("address"))
  const token = parseAddress(url.searchParams.get("token"))
  if (!holder) return errorJson("Pass a valid holder address as ?address=0x…")
  if (!token) return errorJson("Pass a valid bStock token address as ?token=0x…")

  try {
    const client = makeClient()
    const head = await client.getBlockNumber()

    // Scan window: an explicit fromBlock wins (0 means full history, slow); otherwise a bounded
    // lookback so the request stays responsive. The corporate-action wording notes when the scan
    // did not start at deployment, so a bounded window stays honest.
    let fromBlock: bigint
    const fromParam = url.searchParams.get("fromBlock")
    if (fromParam !== null) {
      fromBlock = BigInt(Math.max(0, Math.floor(Number(fromParam))))
    } else {
      let lookback = DEFAULT_LOOKBACK
      const lb = url.searchParams.get("lookback")
      if (lb !== null) {
        const v = BigInt(Math.max(0, Math.floor(Number(lb))))
        lookback = v > MAX_LOOKBACK ? MAX_LOOKBACK : v
      }
      fromBlock = head > lookback ? head - lookback : 0n
    }

    // Price the LIVE balance from the on-chain pool. Historical acquisition prices are not on a
    // public node (state is pruned), so this returns a price only for the current block.
    let spotCache: bigint | null | undefined
    const priceFn = async (args: { token: Address; blockNumber: bigint }): Promise<bigint | null> => {
      if (args.blockNumber < head - 120n) return null
      if (spotCache === undefined) {
        try {
          const state = await market.getMarket(args.token, {})
          const spot = market.spotInQuote(state)
          spotCache = parseUnits(spot.toFixed(USDT_DECIMALS), USDT_DECIMALS)
        } catch {
          spotCache = null
        }
      }
      return spotCache ?? null
    }

    const pl = await ledger.buildPositionLedger(client, holder, token, {
      fromBlock,
      toBlock: head,
      chunkSize: 9000n,
      resolveTimestamps: true,
      priceFn,
    })

    const dp = pl.decimals
    const toUsd = (v?: bigint) => (v === undefined ? null : Number(formatUnits(v, USDT_DECIMALS)))

    const transfers: TransferDTO[] = [...pl.transfers]
      .sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : b.blockNumber > a.blockNumber ? 1 : -1))
      .slice(0, 30)
      .map((t) => ({
        direction: t.direction,
        counterparty: t.counterparty,
        unitsHuman: formatUnits(t.units, dp),
        blockNumber: Number(t.blockNumber),
        txHash: t.txHash,
        timestamp: t.timestamp === undefined ? undefined : Number(t.timestamp),
      }))

    const corporateActions: CorporateActionDTO[] = pl.corporateActions.map((c) => ({
      kind: c.kind,
      unexplainedUnitsHuman: formatUnits(c.unexplainedUnits, dp),
      approxPercent: c.approxPercent,
      explanation: c.explanation,
    }))

    const costBasisUsd = toUsd(pl.costBasisUsdt)
    const basisNote =
      costBasisUsd === null
        ? "Cost basis at each acquisition needs a historical price feed (the RWA Data reference feed once the key is wired). A public node prunes old state, so only the live balance is priced here, from the on-chain pool."
        : "Cost basis is the USDT value of the open lots at their acquisition blocks."

    const body: LedgerResponse = {
      chainId: BSC_CHAIN_ID,
      token: pl.token,
      symbol: pl.symbol,
      decimals: dp,
      genuine: pl.genuine,
      holder: pl.holder,
      scannedFromBlock: Number(pl.scannedFromBlock),
      scannedToBlock: Number(pl.scannedToBlock),
      balanceAtBlock: Number(pl.balanceAtBlock),
      liveBalanceHuman: formatUnits(pl.liveBalance, dp),
      netFromTransfersHuman: formatUnits(pl.netFromTransfers, dp),
      openUnitsHuman: formatUnits(pl.openUnits, dp),
      dividendRebaseHuman: formatUnits(pl.dividendRebaseUnits, dp),
      transferCount: pl.transfers.length,
      transfers,
      lotCount: pl.lots.length,
      openLotCount: pl.lots.filter((l) => l.remaining > 0n).length,
      corporateActions,
      valued: pl.valued,
      currentPriceUsd: toUsd(pl.currentPriceUsdt),
      marketValueUsd: toUsd(pl.marketValueUsdt),
      costBasisUsd,
      realizedPnlUsd: toUsd(pl.realizedPnlUsdt),
      unrealizedPnlUsd: toUsd(pl.unrealizedPnlUsdt),
      basisNote,
    }
    return Response.json(body)
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : String(e), 502)
  }
}
