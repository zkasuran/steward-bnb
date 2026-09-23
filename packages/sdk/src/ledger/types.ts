// Types for the true-position ledger: acquisition lots, cost basis, realized/unrealized position,
// and corporate actions. The whole ledger is a pure on-chain reconstruction, no Binance API key.
import type { Address, Hash } from "viem"

// USDT (BSC-USD) has 18 decimals on BNB Smart Chain. Every USDT value in this module is a raw
// bigint in those units.
export const USDT_DECIMALS = 18

// A price oracle the ledger can be given to value a position in USDT. It returns the USDT price of
// ONE WHOLE token (1 * 10^tokenDecimals raw units) as of a block, in raw USDT units (18 dp), or
// null when no price is known for that block (the ledger then leaves that leg in token units).
// Kept as an injected function so the ledger stays pure on-chain and never calls a pricing API
// itself. A caller wires it to a PancakeSwap pool read or, once available, the RWA Data feed.
export type PriceFn = (
  args: { token: Address; blockNumber: bigint },
) => Promise<bigint | null> | bigint | null

// One ERC-20 Transfer that touches the holder, decoded and normalised to the holder's point of view.
export type TransferRecord = {
  direction: "in" | "out"
  counterparty: Address // the other side: `from` when direction=in, `to` when direction=out
  units: bigint // raw token units moved
  blockNumber: bigint
  txHash: Hash
  logIndex: number
  timestamp?: bigint // unix seconds, present only when timestamps were resolved
}

// An acquisition lot: units received in a single inbound transfer, tracked FIFO. `remaining` is
// what is left after later disposals consumed part of it. The basis fields are present only when a
// PriceFn was supplied and returned a price for the acquisition block.
export type Lot = {
  blockNumber: bigint
  txHash: Hash
  logIndex: number
  timestamp?: bigint
  units: bigint // units acquired in this lot
  remaining: bigint // units still held from this lot (never negative)
  unitPriceUsdt?: bigint // USDT per whole token at acquisition
  costBasisUsdt?: bigint // basis for the ACQUIRED units: units * unitPriceUsdt / 10^decimals
}

export type CorporateActionKind = "rebase_credit"

// A corporate action inferred WITHOUT a matching Transfer. bStocks rebase on dividends and splits,
// so a balance can rise on-chain with no transfer. We detect it as the positive gap between the
// live balanceOf and the balance implied by transfer history. We cannot yet name dividend vs split
// or date each one (the rebase multiplier getter reverts on-chain), so this is the aggregate credit
// standing as of `detectedAtBlock`.
export type CorporateActionEvent = {
  token: Address
  symbol: string
  kind: CorporateActionKind
  detectedAtBlock: bigint
  netFromTransfers: bigint // balance implied by (in - out) transfers, raw units
  liveBalance: bigint // balanceOf now, raw units
  unexplainedUnits: bigint // liveBalance - netFromTransfers, > 0 for a credit
  approxPercent: number // unexplainedUnits as a percent of netFromTransfers (0 when base is 0)
  explanation: string // plain-English, written for a holder who is not crypto-native
}

// The reconstructed position for one holder in one genuine bStocks token.
export type PositionLedger = {
  token: Address
  symbol: string
  decimals: number
  holder: Address
  genuine: boolean // false means the token failed the beacon check; the rest is zeroed and untrusted

  scannedFromBlock: bigint
  scannedToBlock: bigint
  balanceAtBlock: bigint // block the balanceOf leg was read at

  transfers: TransferRecord[]
  lots: Lot[] // all lots; open ones have remaining > 0

  totalAcquiredUnits: bigint
  totalDisposedUnits: bigint
  netFromTransfers: bigint // totalAcquired - totalDisposed
  openUnits: bigint // sum of lot.remaining across open lots
  liveBalance: bigint

  dividendRebaseUnits: bigint // total unexplained positive delta credited on-chain (>= 0)
  corporateActions: CorporateActionEvent[]

  valued: boolean // true iff a PriceFn produced at least one USDT figure
  costBasisUsdt?: bigint // basis of OPEN lots (what you still hold)
  realizedPnlUsdt?: bigint // proceeds - basis over disposals that could be priced on both legs
  currentPriceUsdt?: bigint // USDT per whole token at balanceAtBlock, if the PriceFn knew it
  marketValueUsdt?: bigint // liveBalance valued at currentPriceUsdt
  unrealizedPnlUsdt?: bigint // marketValue - costBasis of open lots
}
