// Lot reconstruction and cost basis. Inbound transfers open FIFO lots; outbound transfers consume
// them oldest-first, realizing gain or loss where both legs can be priced. When no PriceFn is given
// the position stays in raw token units and the USDT figures are left undefined.
//
// A note on rebases: bStocks change balances multiplicatively on dividends and splits, WITHOUT a
// transfer, so the nominal units in transfer history do not always reconcile to today's balance.
// Lots therefore track transfer (nominal) units, and the unexplained positive gap to live balanceOf
// is reported separately as a corporate action rather than folded into a lot. See corporate-actions.ts.
import type { Address } from "viem"
import type { Lot, PriceFn, TransferRecord } from "./types.js"

// units are raw (10^decimals per whole token); unitPriceUsdt is USDT-raw per whole token.
export function valueUnits(units: bigint, unitPriceUsdt: bigint, decimals: number): bigint {
  return (units * unitPriceUsdt) / 10n ** BigInt(decimals)
}

export type LotReconstruction = {
  lots: Lot[]
  totalAcquiredUnits: bigint
  totalDisposedUnits: bigint
  openUnits: bigint
  valued: boolean
  costBasisUsdt?: bigint // basis of OPEN lots (what is still held)
  realizedPnlUsdt?: bigint // proceeds - basis over disposals priced on both legs
}

async function priceAt(
  priceFn: PriceFn | undefined,
  token: Address,
  blockNumber: bigint,
): Promise<bigint | undefined> {
  if (!priceFn) return undefined
  const p = await priceFn({ token, blockNumber })
  return p === null || p === undefined ? undefined : p
}

// `transfers` must already be sorted ascending by (blockNumber, logIndex).
export async function reconstructLots(
  token: Address,
  transfers: TransferRecord[],
  decimals: number,
  priceFn?: PriceFn,
): Promise<LotReconstruction> {
  const lots: Lot[] = []
  let head = 0 // index of the oldest lot that still has units, for FIFO consumption
  let totalAcquiredUnits = 0n
  let totalDisposedUnits = 0n
  let realized = 0n
  let anyPrice = false

  for (const t of transfers) {
    if (t.direction === "in") {
      totalAcquiredUnits += t.units
      const unitPriceUsdt = await priceAt(priceFn, token, t.blockNumber)
      const lot: Lot = {
        blockNumber: t.blockNumber,
        txHash: t.txHash,
        logIndex: t.logIndex,
        timestamp: t.timestamp,
        units: t.units,
        remaining: t.units,
      }
      if (unitPriceUsdt !== undefined) {
        anyPrice = true
        lot.unitPriceUsdt = unitPriceUsdt
        lot.costBasisUsdt = valueUnits(t.units, unitPriceUsdt, decimals)
      }
      lots.push(lot)
    } else {
      totalDisposedUnits += t.units
      const proceedsPrice = await priceAt(priceFn, token, t.blockNumber)
      if (proceedsPrice !== undefined) anyPrice = true
      let toConsume = t.units
      while (toConsume > 0n && head < lots.length) {
        const lot = lots[head]
        if (lot.remaining === 0n) {
          head++
          continue
        }
        const q = toConsume < lot.remaining ? toConsume : lot.remaining
        if (proceedsPrice !== undefined && lot.unitPriceUsdt !== undefined) {
          realized += valueUnits(q, proceedsPrice, decimals) - valueUnits(q, lot.unitPriceUsdt, decimals)
        }
        lot.remaining -= q
        toConsume -= q
        if (lot.remaining === 0n) head++
      }
      // toConsume > 0 here means more units left than were ever received in transfers, which a
      // positive rebase can cause. There is no lot to attribute it to, so it is simply dropped
      // from FIFO; the balance-vs-transfers check still accounts for the net effect.
    }
  }

  let openUnits = 0n
  let costBasisUsdt = 0n
  let anyOpenBasis = false
  for (const lot of lots) {
    if (lot.remaining === 0n) continue
    openUnits += lot.remaining
    if (lot.unitPriceUsdt !== undefined) {
      anyOpenBasis = true
      costBasisUsdt += valueUnits(lot.remaining, lot.unitPriceUsdt, decimals)
    }
  }

  return {
    lots,
    totalAcquiredUnits,
    totalDisposedUnits,
    openUnits,
    valued: anyPrice,
    costBasisUsdt: anyOpenBasis ? costBasisUsdt : undefined,
    realizedPnlUsdt: anyPrice ? realized : undefined,
  }
}
