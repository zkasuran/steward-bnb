// Corporate-action detection, the differentiated insight. A bStocks balance can rise on-chain with
// NO matching Transfer, because the token rebases when a dividend or split is credited. So we never
// trust the transfer-derived balance on its own: we compare it to the live balanceOf and treat a
// positive unexplained gap as a credit the holder received without doing anything.
//
// TODO refine with RWA Data corporate-action feed once the api client is wired: that feed can name
// dividend vs split and date each event, which the current balance-vs-transfers method cannot,
// because the rebase multiplier getter (multiplier / scalingFactor / sharesOf) reverts on the token.
import { formatUnits, type Address } from "viem"
import type { CorporateActionEvent } from "./types.js"

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s
}

export type DetectCorporateActionsParams = {
  token: Address
  symbol: string
  decimals: number
  netFromTransfers: bigint // balance implied by (in - out) transfers, raw units
  liveBalance: bigint // balanceOf now, raw units
  detectedAtBlock: bigint
  scanComplete?: boolean // true when transfers were scanned from the token's first block
  scannedFromBlock?: bigint // for the wording when the scan is not known to be complete
}

// Returns at most one aggregate event. When the transfer scan started at the token's deployment the
// gap is a clean rebase credit. When it started later, part of the gap may be earlier transfers that
// fell outside the scanned range, so the explanation says so rather than overclaiming.
export function detectCorporateActions(params: DetectCorporateActionsParams): CorporateActionEvent[] {
  const { token, symbol, decimals, netFromTransfers, liveBalance, detectedAtBlock } = params
  const unexplainedUnits = liveBalance - netFromTransfers
  if (unexplainedUnits <= 0n) return []

  const approxPercent =
    netFromTransfers > 0n
      ? Number((unexplainedUnits * 1_000_000n) / netFromTransfers) / 10_000
      : 0

  const pctStr = approxPercent > 0 ? `${approxPercent.toFixed(2)}%` : "some"
  const humanExtra = trimZeros(formatUnits(unexplainedUnits, decimals))

  let explanation =
    `Your ${symbol} balance is about ${pctStr} higher than your transfer history explains ` +
    `(${humanExtra} ${symbol} with no matching transfer). bStocks credit dividends and stock ` +
    `splits by rebasing the token on-chain, so this is consistent with a dividend or split ` +
    `credited to you. You were not hacked and you did not need to do anything.`

  if (params.scanComplete === false) {
    const from = params.scannedFromBlock ?? 0n
    explanation +=
      ` Note: transfers were scanned from block ${from}, not the token's first block, so part of ` +
      `this gap may be earlier transfers outside the scanned range rather than a rebase. Scan from ` +
      `the deployment block to be certain.`
  }

  return [
    {
      token,
      symbol,
      kind: "rebase_credit",
      detectedAtBlock,
      netFromTransfers,
      liveBalance,
      unexplainedUnits,
      approxPercent,
      explanation,
    },
  ]
}
