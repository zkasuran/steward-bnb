// Chunked ERC-20 Transfer log reader. bStocks are recent, but a public RPC still caps the span (or
// the result count) of a single eth_getLogs, so the range is paged. The chunk shrinks automatically
// when the endpoint rejects a span, and the reader surfaces a clear error if even the smallest chunk
// is refused (some public BSC endpoints, including the bnbchain dataseed, do not serve eth_getLogs
// at all; point `rpcUrl` at one that does).
import { getAddress, parseAbiItem, type Address, type Hash, type Log, type PublicClient } from "viem"
import type { TransferRecord } from "./types.js"

export const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
)

export type TransferScanOptions = {
  fromBlock?: bigint // default 0n; pass the token's deployment block for a fast, bounded scan
  toBlock?: bigint // default: the client's current head
  chunkSize?: bigint // default 5000n; halved automatically when an RPC rejects the span
  resolveTimestamps?: boolean // default false; when true, block timestamps are batched in
}

const DEFAULT_CHUNK = 5000n
const MIN_CHUNK = 100n

type TransferLog = Log<bigint, number, false, typeof TRANSFER_EVENT, true>

// Walk [from, to] in chunks, shrinking the chunk on any RPC rejection and retrying that same window.
// The shrink is monotonic across the whole walk, so a span that gets rejected once does not get
// re-attempted at the larger size later.
async function getLogsInRange(
  client: PublicClient,
  args: { address: Address; args: Record<string, Address> },
  from: bigint,
  to: bigint,
  startChunk: bigint,
): Promise<TransferLog[]> {
  const out: TransferLog[] = []
  let chunk = startChunk < MIN_CHUNK ? MIN_CHUNK : startChunk
  let start = from
  while (start <= to) {
    let end = start + chunk - 1n
    if (end > to) end = to
    try {
      const logs = await client.getLogs({
        address: args.address,
        event: TRANSFER_EVENT,
        args: args.args,
        fromBlock: start,
        toBlock: end,
      })
      out.push(...(logs as TransferLog[]))
      start = end + 1n
    } catch (err) {
      if (chunk > MIN_CHUNK) {
        chunk = chunk / 2n
        if (chunk < MIN_CHUNK) chunk = MIN_CHUNK
        continue
      }
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(
        `getLogs was rejected on blocks ${start}-${end} at the minimum chunk of ${MIN_CHUNK}: ${message}. ` +
          `This RPC may not serve eth_getLogs (the bnbchain dataseed rejects log queries); ` +
          `set rpcUrl to a log-serving endpoint.`,
      )
    }
  }
  return out
}

function toRecord(log: TransferLog, holder: Address): TransferRecord | null {
  if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) return null
  const from = log.args.from
  const to = log.args.to
  const value = log.args.value
  if (from === undefined || to === undefined || value === undefined) return null
  const direction: "in" | "out" = getAddress(to) === holder ? "in" : "out"
  const counterparty = direction === "in" ? getAddress(from) : getAddress(to)
  return {
    direction,
    counterparty,
    units: value,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash as Hash,
    logIndex: log.logIndex,
  }
}

// Fetch every Transfer into and out of `holder` for `token`, sorted ascending by (block, logIndex).
// Inbound (to=holder) and outbound (from=holder) are two indexed-topic filters, so the endpoint only
// returns the holder's own transfers rather than the whole token's traffic.
export async function fetchTransferLogs(
  client: PublicClient,
  token: Address,
  holder: Address,
  options: TransferScanOptions = {},
): Promise<TransferRecord[]> {
  const owner = getAddress(holder)
  const addr = getAddress(token)
  const fromBlock = options.fromBlock ?? 0n
  const toBlock = options.toBlock ?? (await client.getBlockNumber())
  const chunk = options.chunkSize ?? DEFAULT_CHUNK

  const [inbound, outbound] = await Promise.all([
    getLogsInRange(client, { address: addr, args: { to: owner } }, fromBlock, toBlock, chunk),
    getLogsInRange(client, { address: addr, args: { from: owner } }, fromBlock, toBlock, chunk),
  ])

  const records: TransferRecord[] = []
  for (const log of [...inbound, ...outbound]) {
    const rec = toRecord(log, owner)
    if (rec) records.push(rec)
  }

  // Sort by block then logIndex so FIFO lot matching sees transfers in on-chain order. A self-send
  // (holder to holder) can appear in both lists; de-dupe on (txHash, logIndex, direction).
  records.sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  )
  const seen = new Set<string>()
  const deduped = records.filter((r) => {
    const key = `${r.txHash}:${r.logIndex}:${r.direction}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (options.resolveTimestamps && deduped.length > 0) {
    const uniqueBlocks = [...new Set(deduped.map((r) => r.blockNumber))]
    const stamps = new Map<bigint, bigint>()
    await Promise.all(
      uniqueBlocks.map(async (bn) => {
        const block = await client.getBlock({ blockNumber: bn })
        stamps.set(bn, block.timestamp)
      }),
    )
    for (const rec of deduped) rec.timestamp = stamps.get(rec.blockNumber)
  }

  return deduped
}
