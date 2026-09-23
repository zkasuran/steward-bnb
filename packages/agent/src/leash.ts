// Leash: a guard-railed decision loop for a tokenized-stock basket. On each run it reads the holder's
// live holdings and the corporate actions for the basket, checks the pre-trade guard, then proposes a
// rebalance ONLY inside hard limits: a ticker allowlist, a per-position cap and a daily budget. It
// PROPOSES an action plan and signs nothing. Execution is a separate gated step behind the operator's
// key, never here. Every read is free BSC RPC plus the injected Web3ApiClient (a keyless mock in a dry
// run). This is the runtime behind the BNB Agent Studio special: identity is ERC-8004, the work is this.
import { getAddress, type Address, type PublicClient } from "viem"
import { basket as sdkBasket, guard as sdkGuard, api as sdkApi } from "@steward/sdk"

type Basket = sdkBasket.Basket
type Web3ApiClient = sdkApi.Web3ApiClient
type CorporateAction = sdkApi.CorporateAction
type GuardAction = sdkGuard.GuardAction

export interface LeashLimits {
  // Uppercase bStock tickers the agent is allowed to act on. A leg outside this set is blocked, never
  // silently traded. Empty means "the basket's own tickers".
  tickerAllowlist: string[]
  // The most USD the agent may move in a single leg. A larger proposed leg is clamped to this.
  perPositionCapUsd: number
  // The most USD of BUYS the agent may propose across one run. Buys are clamped to what is left.
  dailyBudgetUsd: number
  // Rebalance band in percentage points. A leg inside the band is left alone. Defaults to the SDK band.
  driftThresholdPct?: number
}

export interface ProposedAction {
  ticker: string
  token: Address
  side: "buy" | "sell"
  // What the plain rebalance asked for, in USD.
  requestedUsd: number
  // What the leash approved after the allowlist, cap, budget and guard, in USD.
  approvedUsd: number
  status: "proposed" | "clamped" | "blocked"
  // The guard's verdict for a buy leg, when the guard was run.
  guardAction?: GuardAction
  reasons: string[]
}

export interface LeashPlan {
  holder: Address
  basketId: string
  generatedAt: string
  atBlock: number | null
  portfolioValueUsd: number
  complete: boolean
  corporateActions: CorporateAction[]
  driftThresholdPct: number
  limits: LeashLimits
  actions: ProposedAction[]
  approvedBuyUsd: number
  approvedSellUsd: number
  // True when every approved action respects the cap and the total buys respect the budget.
  withinLimits: boolean
  // Always true. A plan is a proposal to be reviewed and executed elsewhere, never signed here.
  gated: true
  note: string
}

export interface LeashInput {
  holder: Address
  basket: Basket
  limits: LeashLimits
  api: Web3ApiClient
  client?: PublicClient
  now?: Date
  // Run the on-chain pre-trade guard on each buy leg. Costs extra RPC. Default true.
  runGuard?: boolean
}

// Gather the corporate actions for a basket's tickers through the injected client, deduped. A feed
// that is down for one ticker degrades to a skip rather than sinking the run.
async function readCorporateActions(basket: Basket, apiClient: Web3ApiClient): Promise<CorporateAction[]> {
  const tickers = Object.keys(basket.weights)
  const seen = new Set<string>()
  const out: CorporateAction[] = []
  for (const ticker of tickers) {
    try {
      const res = await apiClient.getCorporateActions({ symbol: ticker })
      for (const action of res.actions) {
        const key = `${action.type}:${action.symbol}:${action.exDate ?? ""}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push(action)
      }
    } catch {
      // Skip this ticker's feed. The rebalance does not depend on it.
    }
  }
  return out
}

export async function decideLeash(input: LeashInput): Promise<LeashPlan> {
  const holder = getAddress(input.holder)
  const runGuard = input.runGuard ?? true
  const allowlist = new Set(
    (input.limits.tickerAllowlist.length > 0 ? input.limits.tickerAllowlist : Object.keys(input.basket.weights)).map((t) =>
      t.trim().toUpperCase(),
    ),
  )

  // 1. Corporate-action awareness (RWA Data), for context in the plan.
  const corporateActions = await readCorporateActions(input.basket, input.api)

  // 2. Live position: beacon-checked holdings, priced from the deepest USDT pool. Free RPC.
  const state = await sdkBasket.analyzeBasket(input.basket, holder, { client: input.client })

  // 3. The plain rebalance the drift band asks for. Pure math.
  const driftThresholdPct = input.limits.driftThresholdPct ?? sdkBasket.DEFAULT_DRIFT_THRESHOLD_PCT
  const plan = sdkBasket.planRebalance(state, { driftThresholdPct })

  // 4. Fold in the hard limits leg by leg. Buys draw down the daily budget in the plan's order (sells
  // first, then largest buys), so the budget funds the highest-priority buys first.
  const actions: ProposedAction[] = []
  let approvedBuyUsd = 0
  let approvedSellUsd = 0
  let budgetLeft = input.limits.dailyBudgetUsd

  for (const leg of plan.legs) {
    const ticker = leg.ticker.toUpperCase()
    const reasons: string[] = []

    if (!allowlist.has(ticker)) {
      actions.push({
        ticker,
        token: getAddress(leg.token),
        side: leg.side,
        requestedUsd: leg.usdtAmount,
        approvedUsd: 0,
        status: "blocked",
        reasons: [`${ticker} is not in the ticker allowlist, so the agent may not act on it.`],
      })
      continue
    }

    let approved = leg.usdtAmount
    let status: ProposedAction["status"] = "proposed"

    // Per-position cap.
    if (approved > input.limits.perPositionCapUsd) {
      approved = input.limits.perPositionCapUsd
      status = "clamped"
      reasons.push(`Clamped to the $${input.limits.perPositionCapUsd.toFixed(2)} per-position cap.`)
    }

    if (leg.side === "buy") {
      // Daily budget.
      if (budgetLeft <= 0) {
        actions.push({
          ticker,
          token: getAddress(leg.token),
          side: "buy",
          requestedUsd: leg.usdtAmount,
          approvedUsd: 0,
          status: "blocked",
          reasons: [...reasons, "The daily buy budget is exhausted."],
        })
        continue
      }
      if (approved > budgetLeft) {
        approved = budgetLeft
        status = "clamped"
        reasons.push(`Clamped to the $${budgetLeft.toFixed(2)} left in the daily buy budget.`)
      }

      // Pre-trade guard on the approved size.
      let guardAction: GuardAction | undefined
      if (runGuard && approved > 0) {
        try {
          const verdict = await sdkGuard.guardTrade({
            token: getAddress(leg.token),
            usdtIn: approved,
            api: input.api,
            publicClient: input.client,
            symbol: ticker,
            now: input.now,
          })
          guardAction = verdict.action
          if (verdict.action === "block") {
            actions.push({
              ticker,
              token: getAddress(leg.token),
              side: "buy",
              requestedUsd: leg.usdtAmount,
              approvedUsd: 0,
              status: "blocked",
              guardAction,
              reasons: [...reasons, ...verdict.reasons],
            })
            continue
          }
          if (verdict.action === "resize") {
            const safe = verdict.details.depth?.suggestedUsdtIn
            if (safe !== undefined && safe < approved) {
              approved = safe
              status = "clamped"
            }
            reasons.push(...verdict.reasons)
          } else if (verdict.action === "warn") {
            reasons.push(...verdict.reasons)
          }
        } catch (e) {
          reasons.push(`Guard check could not run (${(e as Error).message.slice(0, 80)}); leg left at the clamped size.`)
        }
      }

      approvedBuyUsd += approved
      budgetLeft -= approved
      if (reasons.length === 0) reasons.push("Within the allowlist, cap, budget and guard.")
      actions.push({ ticker, token: getAddress(leg.token), side: "buy", requestedUsd: leg.usdtAmount, approvedUsd: approved, status, guardAction, reasons })
    } else {
      // Sell: reduces exposure, so the guard's buy-side depth check does not apply. Still capped.
      approvedSellUsd += approved
      if (reasons.length === 0) reasons.push("Sell to reduce an overweight leg; within the allowlist and cap.")
      actions.push({ ticker, token: getAddress(leg.token), side: "sell", requestedUsd: leg.usdtAmount, approvedUsd: approved, status, reasons })
    }
  }

  const withinLimits =
    approvedBuyUsd <= input.limits.dailyBudgetUsd + 1e-9 &&
    actions.every((a) => a.approvedUsd <= input.limits.perPositionCapUsd + 1e-9)

  const note = buildNote(plan, actions, approvedBuyUsd, approvedSellUsd, state.complete)

  return {
    holder,
    basketId: input.basket.id,
    generatedAt: new Date().toISOString(),
    atBlock: state.atBlock,
    portfolioValueUsd: state.portfolioValueUsd,
    complete: state.complete,
    corporateActions,
    driftThresholdPct,
    limits: input.limits,
    actions,
    approvedBuyUsd,
    approvedSellUsd,
    withinLimits,
    gated: true,
    note,
  }
}

function buildNote(
  plan: sdkBasket.RebalancePlan,
  actions: ProposedAction[],
  approvedBuyUsd: number,
  approvedSellUsd: number,
  complete: boolean,
): string {
  if (plan.legs.length === 0) return plan.note
  const blocked = actions.filter((a) => a.status === "blocked").length
  const clamped = actions.filter((a) => a.status === "clamped").length
  let note = `Proposed ${actions.length} leg(s): $${approvedBuyUsd.toFixed(2)} of buys and $${approvedSellUsd.toFixed(2)} of sells approved`
  if (clamped > 0) note += `, ${clamped} clamped to the limits`
  if (blocked > 0) note += `, ${blocked} blocked`
  note += ". Execution is a gated guarded-swap step behind the operator's key, not performed here."
  if (!complete) note += " Valuation was incomplete: at least one held leg could not be priced, so treat this plan as advisory."
  return note
}
