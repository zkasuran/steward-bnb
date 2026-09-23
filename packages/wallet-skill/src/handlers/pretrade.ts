// Intent: "is it safe to buy $100 of NVDAB now". Runs the SDK guard, which composes authenticity,
// premium-to-NAV, depth/slippage and market-hours into one verdict, then hands back a TradePlan with
// safe parameters. It NEVER signs or sends: executing the plan through the Agentic Wallet (baw) is a
// gated human step. The on-chain legs are keyless; the reference-price leg uses the injected client.
import { guard } from "@steward/sdk"
import type { Address } from "viem"
import { resolveContext } from "../context.js"
import { resolveToken } from "../resolve.js"
import type { GuardVerdict, SkillContext, SkillResult, TradePlan } from "../types.js"

function pctToBps(pct: number): number {
  return Math.round(pct * 100)
}

// Map the guard verdict to the swap a human would run. A block returns a do-not-execute plan with no
// command; a resize points at the largest safe size the guard found; allow and warn keep the request.
function buildPlan(verdict: GuardVerdict, tokenAddress: Address, requestedUsdt: number): TradePlan {
  const details = verdict.details
  const quote = details.quote
  const toSymbol = details.symbol
  const maxSlippagePct = details.thresholds.slippageResizePct

  let decision: TradePlan["decision"]
  let amountUsdt: number
  if (verdict.action === "block") {
    decision = "do-not-execute"
    amountUsdt = 0
  } else if (verdict.action === "resize") {
    const suggested = details.depth?.suggestedUsdtIn
    if (suggested !== undefined && suggested > 0) {
      decision = "resize-then-execute"
      amountUsdt = suggested
    } else {
      decision = "do-not-execute"
      amountUsdt = 0
    }
  } else {
    decision = "execute"
    amountUsdt = requestedUsdt
  }

  const tokenRef = toSymbol ?? tokenAddress
  const command =
    decision === "do-not-execute"
      ? null
      : `baw swap --chain bsc --from USDT --to ${tokenRef} --amount-in ${amountUsdt} --max-slippage-bps ${pctToBps(maxSlippagePct)}`

  return {
    decision,
    fromToken: { symbol: "USDT", address: quote },
    toToken: { symbol: toSymbol, address: tokenAddress },
    requestedUsdt,
    amountUsdt,
    maxSlippagePct,
    quote,
    chain: "bsc",
    signed: false,
    execution: {
      surface: "agentic-wallet",
      cli: "baw",
      suggestedCommand: command,
      gatedHumanStep: true,
    },
  }
}

export async function assessBuy(ref: string, usdtIn: number, ctx: SkillContext = {}): Promise<SkillResult<GuardVerdict | null>> {
  const resolved = resolveToken(ref)
  if (!resolved) {
    return {
      intent: "pretradeGuard",
      ok: false,
      advisory: true,
      signed: false,
      headline: `Could not resolve "${ref}" to a token. Pass a bStocks symbol or a 0x address.`,
      detail: ["The pre-trade guard needs a concrete token to check authenticity, premium and depth."],
      data: null,
      dataSource: "on-chain + reference (mock-until-key)",
      notes: [],
    }
  }

  const rc = resolveContext(ctx)
  const verdict = await guard.guardTrade({
    token: resolved.address,
    usdtIn,
    api: rc.api,
    now: rc.now,
    publicClient: rc.publicClient,
    symbol: resolved.symbol,
  })
  const plan = buildPlan(verdict, resolved.address, usdtIn)
  const label = verdict.details.symbol ?? resolved.symbol ?? resolved.address

  const headlineByAction: Record<GuardVerdict["action"], string> = {
    allow: `Safe to buy $${usdtIn} of ${label} now.`,
    warn: `You can buy $${usdtIn} of ${label}, with warnings.`,
    resize:
      plan.decision === "resize-then-execute"
        ? `Do not buy $${usdtIn} of ${label} at that size. Resize to about $${plan.amountUsdt.toFixed(2)} first.`
        : `Do not buy $${usdtIn} of ${label}. The pool cannot fill a safe size right now.`,
    block: `Do not buy ${label}. The guard blocked this trade.`,
  }

  const notes: string[] = [resolved.note]
  if (rc.apiIsMock) {
    notes.push("Reference price came from the keyless mock (mock-until-key). Wire the real Web3 API client for a live NAV check.")
  }
  notes.push("Advisory only. Steward does not sign or send. Run the plan through the Agentic Wallet yourself.")

  return {
    intent: "pretradeGuard",
    ok: true,
    advisory: true,
    signed: false,
    headline: headlineByAction[verdict.action],
    detail: verdict.reasons,
    data: verdict,
    plan,
    dataSource: rc.apiIsMock ? "on-chain + reference (mock-until-key)" : "on-chain + reference",
    notes,
  }
}
