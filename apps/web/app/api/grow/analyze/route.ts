// GROW / Conviction: analyse one basket against a holder's wallet. Reads real balances
// (beacon-checked) and prices each leg from the deepest on-chain bStock/USDT pool, then derives
// current weights, drift versus target and a plan-only rebalance. The plan is gated: this route
// never signs, sends or spends. Execution is a separate guarded-swap step.
import { formatUnits } from "viem"
import { basket } from "@steward/sdk"
import { BSC_CHAIN_ID } from "@/lib/format"
import { parseAddress, errorJson } from "@/lib/sdk-server"
import type { AnalyzeResponse, BasketLegDTO, RebalanceLegDTO } from "@/lib/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const holder = parseAddress(url.searchParams.get("address"))
  const basketId = url.searchParams.get("basketId") ?? ""
  if (!holder) return errorJson("Pass a valid holder address as ?address=0x…")

  const target = basket.BASKETS_BY_ID[basketId]
  if (!target) return errorJson(`Unknown basket "${basketId}". Try one of the listed baskets.`)

  let driftThresholdPct = basket.DEFAULT_DRIFT_THRESHOLD_PCT
  const dt = url.searchParams.get("driftThreshold")
  if (dt !== null && Number.isFinite(Number(dt))) driftThresholdPct = Math.max(0, Number(dt))

  try {
    const state = await basket.analyzeBasket(target, holder)
    const plan = basket.planRebalance(state, { driftThresholdPct })

    const legs: BasketLegDTO[] = state.legs.map((l) => ({
      ticker: l.ticker,
      token: l.token,
      genuine: l.genuine,
      balanceHuman: formatUnits(l.balance, l.decimals),
      units: l.units,
      priceUsd: l.priceUsd,
      valueUsd: l.valueUsd,
      targetWeight: l.targetWeight,
      currentWeight: l.currentWeight,
      driftPct: l.driftPct,
    }))

    const planLegs: RebalanceLegDTO[] = plan.legs.map((l) => ({
      ticker: l.ticker,
      token: l.token,
      side: l.side,
      usdtAmount: l.usdtAmount,
      currentWeight: l.currentWeight,
      targetWeight: l.targetWeight,
      driftPct: l.driftPct,
    }))

    const body: AnalyzeResponse = {
      chainId: BSC_CHAIN_ID,
      basketId: state.basketId,
      name: state.name,
      holder,
      atBlock: state.atBlock,
      portfolioValueUsd: state.portfolioValueUsd,
      complete: state.complete,
      legs,
      plan: {
        driftThresholdPct: plan.driftThresholdPct,
        legs: planLegs,
        totalBuyUsd: plan.totalBuyUsd,
        totalSellUsd: plan.totalSellUsd,
        netUsdtDeltaUsd: plan.netUsdtDeltaUsd,
        gated: plan.gated,
        note: plan.note,
      },
    }
    return Response.json(body)
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : String(e), 502)
  }
}
