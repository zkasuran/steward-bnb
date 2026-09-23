// Intent: "why did my balance change". Reconstruct the position from Transfer history and compare it to
// the live balance. A balance that grew with no matching transfer is a dividend or split rebase, not a
// deposit and not a hack. Cross-references the reference corporate-action feed for the human-readable
// reason. On-chain reconstruction is keyless; the reference feed uses the injected client
// (mock-until-key). No transaction, no signing.
import { ledger } from "@steward/sdk"
import type { Address } from "viem"
import type { api } from "@steward/sdk"
import { resolveContext } from "../context.js"
import { resolveToken } from "../resolve.js"
import type { PositionLedger, SkillContext, SkillResult } from "../types.js"

type ReferenceAction = api.CorporateAction

export interface CorporateActionData {
  ledger: PositionLedger
  referenceActions: ReferenceAction[]
}

export interface BalanceChangeOptions {
  fromBlock?: bigint
  toBlock?: bigint
}

export async function explainBalanceChange(
  ref: string,
  holder: Address,
  ctx: SkillContext = {},
  opts: BalanceChangeOptions = {},
): Promise<SkillResult<CorporateActionData | null>> {
  const resolved = resolveToken(ref)
  if (!resolved) {
    return {
      intent: "corporateAction",
      ok: false,
      advisory: true,
      signed: false,
      headline: `Could not resolve "${ref}" to a token. Pass a bStocks symbol or a 0x address.`,
      detail: ["The balance-change explainer needs a concrete bStocks token to reconstruct its position."],
      data: null,
      dataSource: "on-chain",
      notes: [],
    }
  }

  const rc = resolveContext(ctx)
  const positionLedger = await ledger.buildPositionLedger(rc.publicClient, holder, resolved.address, {
    fromBlock: opts.fromBlock,
    toBlock: opts.toBlock,
  })

  // Reference corporate actions (dividend/split metadata) explain WHY a rebase happened.
  let referenceActions: ReferenceAction[] = []
  let referenceError: string | undefined
  const symbol = positionLedger.symbol || resolved.symbol
  if (symbol) {
    try {
      const resp = await rc.api.getCorporateActions({ symbol })
      referenceActions = resp.actions
    } catch (e) {
      referenceError = e instanceof Error ? e.message : String(e)
    }
  }

  const label = positionLedger.symbol || resolved.symbol || resolved.address
  const rebased = positionLedger.dividendRebaseUnits > 0n
  const detail: string[] = []
  if (!positionLedger.genuine) {
    detail.push(`${label} is not a genuine bStocks token, so there is no true position to reconstruct. Check its authenticity first.`)
  } else if (rebased) {
    const approx = Number(positionLedger.dividendRebaseUnits) / 10 ** positionLedger.decimals
    detail.push(`Your ${label} balance grew by about ${approx} tokens with no matching transfer. That is a dividend or split rebase, not a deposit and not a hack.`)
    for (const ca of referenceActions) {
      const when = ca.payDate ?? ca.exDate
      const on = when ? ` on ${new Date(when).toISOString().slice(0, 10)}` : ""
      const cash = ca.cashPerShare ? ` of ${ca.cashPerShare} ${ca.currency ?? "USD"} per share` : ""
      detail.push(`Reference feed: a ${ca.type}${cash}${on}. This is the corporate action behind the balance change.`)
    }
  } else {
    detail.push(`Your ${label} balance matches its transfer history. No unexplained rebase was detected in the scanned range.`)
  }
  for (const ev of positionLedger.corporateActions) {
    detail.push(ev.explanation)
  }
  if (referenceError) {
    detail.push(`Reference corporate-action feed unavailable (${referenceError}); the on-chain rebase detection above still stands.`)
  }

  const notes: string[] = [resolved.note]
  if (rc.apiIsMock) {
    notes.push("Reference corporate actions came from the keyless mock (mock-until-key). Wire the real Web3 API client for live dividend and split data.")
  }
  if (positionLedger.genuine && positionLedger.scannedFromBlock !== 0n) {
    notes.push(`Transfer scan started at block ${positionLedger.scannedFromBlock}, so acquisitions before it are not counted. Pass fromBlock 0 for full history.`)
  }

  return {
    intent: "corporateAction",
    ok: true,
    advisory: true,
    signed: false,
    headline: rebased
      ? `Your ${label} balance changed because of a dividend or split rebase, not a transfer.`
      : `Your ${label} balance matches its transfer history.`,
    detail,
    data: { ledger: positionLedger, referenceActions },
    dataSource: rc.apiIsMock ? "on-chain + reference (mock-until-key)" : "on-chain + reference",
    notes,
  }
}
