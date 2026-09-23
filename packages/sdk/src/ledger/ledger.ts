// The true-position ledger builder. Pure on-chain: it reads Transfer logs, reconstructs FIFO lots
// and cost basis, values the position in USDT when a PriceFn is supplied, and detects corporate
// actions (dividend/split rebases) by comparing the transfer-derived balance to the live balanceOf.
// No Binance Web3 API key, no transactions, no signing.
import { getAddress, type Address, type PublicClient } from "viem"
import { isGenuineBStock, makeClient, readBalance, readTokenMeta } from "../chain/bstocks.js"
import { RPC_ENDPOINTS } from "../chain/constants.js"
import { detectCorporateActions } from "./corporate-actions.js"
import { reconstructLots, valueUnits } from "./lots.js"
import { fetchTransferLogs, type TransferScanOptions } from "./transfers.js"
import type { PositionLedger, PriceFn } from "./types.js"

export type BuildLedgerOptions = TransferScanOptions & {
  priceFn?: PriceFn // supply to value the position in USDT; omit to keep it in token units
  rpcUrl?: string // endpoint for the chunked log reads; default RPC_ENDPOINTS.logs[0] (drpc, serves getLogs)
  logClient?: PublicClient // pre-built client for the log reads (overrides rpcUrl); handy for tests
}

function emptyLedger(
  token: Address,
  holder: Address,
  meta: { symbol: string; decimals: number },
  genuine: boolean,
  block: bigint,
): PositionLedger {
  return {
    token,
    symbol: meta.symbol,
    decimals: meta.decimals,
    holder,
    genuine,
    scannedFromBlock: block,
    scannedToBlock: block,
    balanceAtBlock: block,
    transfers: [],
    lots: [],
    totalAcquiredUnits: 0n,
    totalDisposedUnits: 0n,
    netFromTransfers: 0n,
    openUnits: 0n,
    liveBalance: 0n,
    dividendRebaseUnits: 0n,
    corporateActions: [],
    valued: false,
  }
}

// Build the ledger for one holder in one token. The token is verified genuine by its beacon first;
// a non-genuine token returns a zeroed ledger with genuine=false rather than a trusted position.
// `client` serves the single reads (beacon, meta, balanceOf); the chunked log reads go to a separate
// bulk client so the PublicNode single-read tier is never used for a bulk log scan.
export async function buildPositionLedger(
  client: PublicClient,
  holder: Address,
  token: Address,
  options: BuildLedgerOptions = {},
): Promise<PositionLedger> {
  const owner = getAddress(holder)
  const addr = getAddress(token)

  const genuine = await isGenuineBStock(client, addr)
  const meta = await readTokenMeta(client, addr)
  const head = await client.getBlockNumber()

  if (!genuine) {
    return emptyLedger(addr, owner, meta, false, head)
  }

  const logClient = options.logClient ?? makeClient(options.rpcUrl ?? RPC_ENDPOINTS.logs[0])
  const toBlock = options.toBlock ?? head

  const transfers = await fetchTransferLogs(logClient, addr, owner, {
    fromBlock: options.fromBlock,
    toBlock,
    chunkSize: options.chunkSize,
    resolveTimestamps: options.resolveTimestamps,
  })

  const recon = await reconstructLots(addr, transfers, meta.decimals, options.priceFn)
  const netFromTransfers = recon.totalAcquiredUnits - recon.totalDisposedUnits
  const liveBalance = await readBalance(client, owner, addr)
  const scannedFromBlock = options.fromBlock ?? 0n

  const corporateActions = detectCorporateActions({
    token: addr,
    symbol: meta.symbol,
    decimals: meta.decimals,
    netFromTransfers,
    liveBalance,
    detectedAtBlock: head,
    scanComplete: scannedFromBlock === 0n,
    scannedFromBlock,
  })
  const dividendRebaseUnits = liveBalance > netFromTransfers ? liveBalance - netFromTransfers : 0n

  // Valuation at the current block, when a price is known. Market value is of the LIVE balance (what
  // is actually held, rebase units included); unrealized is that value minus the basis of open lots,
  // so rebase-credited units, which have no acquisition cost, show up as unrealized gain, which is
  // what they economically are.
  let currentPriceUsdt: bigint | undefined
  let marketValueUsdt: bigint | undefined
  let unrealizedPnlUsdt: bigint | undefined
  if (options.priceFn) {
    const p = await options.priceFn({ token: addr, blockNumber: head })
    if (p !== null && p !== undefined) {
      currentPriceUsdt = p
      marketValueUsdt = valueUnits(liveBalance, p, meta.decimals)
      unrealizedPnlUsdt = marketValueUsdt - (recon.costBasisUsdt ?? 0n)
    }
  }

  return {
    token: addr,
    symbol: meta.symbol,
    decimals: meta.decimals,
    holder: owner,
    genuine: true,
    scannedFromBlock,
    scannedToBlock: toBlock,
    balanceAtBlock: head,
    transfers,
    lots: recon.lots,
    totalAcquiredUnits: recon.totalAcquiredUnits,
    totalDisposedUnits: recon.totalDisposedUnits,
    netFromTransfers,
    openUnits: recon.openUnits,
    liveBalance,
    dividendRebaseUnits,
    corporateActions,
    valued: recon.valued || currentPriceUsdt !== undefined,
    costBasisUsdt: recon.costBasisUsdt,
    realizedPnlUsdt: recon.realizedPnlUsdt,
    currentPriceUsdt,
    marketValueUsdt,
    unrealizedPnlUsdt,
  }
}

// Build ledgers for a set of candidate tokens. Each is verified genuine by beacon inside
// buildPositionLedger, so a scam clone comes back as a zeroed genuine=false ledger rather than a
// trusted position. Runs sequentially to stay gentle on the log RPC.
export async function buildPortfolioLedger(
  client: PublicClient,
  holder: Address,
  tokens: Address[],
  options: BuildLedgerOptions = {},
): Promise<PositionLedger[]> {
  const out: PositionLedger[] = []
  for (const token of tokens) {
    out.push(await buildPositionLedger(client, holder, token, options))
  }
  return out
}
