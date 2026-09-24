// Client-side True-Position Ledger read. Ported from app/api/know/ledger/route.ts so the
// eth_getLogs scan runs in the judge's browser (a residential IP the public BSC log RPCs serve)
// instead of on a Vercel cloud IP those RPCs reject. Same reconstruction, same priceFn, same DTO
// the panel already renders, so the UI is unchanged. Pure reads: no Binance Web3 API key, no
// transaction, no signing. This module is imported only by the "use client" ledger panel, so it is
// bundled for the browser (which pulls @steward/sdk and viem into the client bundle, as expected).
import { formatUnits, parseUnits, type Address } from "viem"
import { makeClient, ledger, market } from "@steward/sdk"
import { BSC_CHAIN_ID } from "@/lib/format"
import type { CorporateActionDTO, LedgerResponse, TransferDTO } from "@/lib/types"

// The public log RPC. PublicNode serves eth_getLogs from a residential IP and sends
// access-control-allow-origin: *, so the browser fetch is allowed. It is the SDK's default log
// tier too; named here so the client path never depends on a host env var. The one client is
// reused for the single reads, the chunked log reads and the pool price, so every request stays on
// this one CORS-open endpoint rather than falling to a dataseed node the browser may not reach.
const LOGS_RPC = "https://bsc-rpc.publicnode.com"

const DEFAULT_LOOKBACK = 120_000n // ~1 day of BSC blocks; a gentle default the user can widen
const MAX_LOOKBACK = 6_000_000n
const USDT_DECIMALS = 18

// A bounded lookback (blocks back from head) or an explicit fromBlock (0 = full history, slow).
export type LedgerScan = { lookback?: number; fromBlock?: number }

export async function buildLedgerInBrowser(
  holder: string,
  token: string,
  scan: LedgerScan,
): Promise<LedgerResponse> {
  const client = makeClient(LOGS_RPC)
  const head = await client.getBlockNumber()

  // Scan window: an explicit fromBlock wins; otherwise a bounded lookback so the read stays
  // responsive. The corporate-action wording notes when the scan did not start at deployment, so a
  // bounded window stays honest.
  let fromBlock: bigint
  if (scan.fromBlock !== undefined) {
    fromBlock = BigInt(Math.max(0, Math.floor(scan.fromBlock)))
  } else {
    let lookback = DEFAULT_LOOKBACK
    if (scan.lookback !== undefined) {
      const v = BigInt(Math.max(0, Math.floor(scan.lookback)))
      lookback = v > MAX_LOOKBACK ? MAX_LOOKBACK : v
    }
    fromBlock = head > lookback ? head - lookback : 0n
  }

  // Price the LIVE balance from the on-chain pool, the same approach the server route used.
  // Historical acquisition prices are not on a public node (state is pruned), so a price is
  // returned only for the current block. The pool read reuses the publicnode client so it stays on
  // the CORS-open endpoint.
  let spotCache: bigint | null | undefined
  const priceFn = async (args: { token: Address; blockNumber: bigint }): Promise<bigint | null> => {
    if (args.blockNumber < head - 120n) return null
    if (spotCache === undefined) {
      try {
        const state = await market.getMarket(args.token, { client })
        const spot = market.spotInQuote(state)
        spotCache = parseUnits(spot.toFixed(USDT_DECIMALS), USDT_DECIMALS)
      } catch {
        spotCache = null
      }
    }
    return spotCache ?? null
  }

  const pl = await ledger.buildPositionLedger(client, holder as Address, token as Address, {
    fromBlock,
    toBlock: head,
    chunkSize: 9000n,
    resolveTimestamps: true,
    priceFn,
    logClient: client,
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

  return {
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
}
