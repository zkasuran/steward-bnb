// USE / Guard: the pre-trade gate. One token plus a USDT size folds into one verdict
// (allow / warn / resize / block) with plain reasons a non-crypto user can act on. It checks
// authenticity by beacon, premium to the reference price, depth and slippage from the pool, plus
// US market hours. The reference price comes from the keyless mock feed, labelled, until the key
// is wired. Reads only, no signing, no send, no spend.
import { guard, api } from "@steward/sdk"
import { BSC_CHAIN_ID } from "@/lib/format"
import { parseAddress, errorJson } from "@/lib/sdk-server"
import type { GuardResponse } from "@/lib/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const token = parseAddress(url.searchParams.get("token"))
  if (!token) return errorJson("Pass a valid bStock token address as ?token=0x…")

  const usdtIn = Number(url.searchParams.get("usdtIn") ?? "100")
  if (!Number.isFinite(usdtIn) || usdtIn <= 0) return errorJson("Pass a positive ?usdtIn= size in USDT")

  try {
    const verdict = await guard.guardTrade({ token, usdtIn, api: new api.MockWeb3ApiClient() })
    const d = verdict.details

    const body: GuardResponse = {
      chainId: BSC_CHAIN_ID,
      action: verdict.action,
      reasons: verdict.reasons,
      token: d.token,
      symbol: d.symbol ?? null,
      usdtIn: d.usdtIn,
      atBlock: d.atBlock ?? null,
      referenceIsMock: true,
      authenticity: d.authenticity,
      premium: d.premium
        ? {
            spotUsdtPerToken: d.premium.spotUsdtPerToken,
            referencePrice: d.premium.referencePrice,
            tokenToShareRatio: d.premium.tokenToShareRatio,
            fairUsdtPerToken: d.premium.fairUsdtPerToken,
            premiumPct: d.premium.premiumPct,
            source: d.premium.source,
          }
        : null,
      premiumError: d.premiumError,
      depth: d.depth
        ? {
            slippagePct: d.depth.slippagePct,
            priceMovePct: d.depth.priceMovePct,
            tokensOut: d.depth.tokensOut,
            executionPrice: d.depth.executionPrice,
            spotPrice: d.depth.spotPrice,
            feePaidUsdt: d.depth.feePaidUsdt,
            feePpm: d.depth.feePpm,
            reliable: d.depth.reliable,
            note: d.depth.note,
            suggestedUsdtIn: d.depth.suggestedUsdtIn,
            pool: d.depth.pool,
          }
        : null,
      depthError: d.depthError,
      marketHours: d.marketHours
        ? {
            isOpen: d.marketHours.isOpen,
            weekday: d.marketHours.weekday,
            etTime: d.marketHours.etTime,
            reason: d.marketHours.reason,
          }
        : null,
      thresholds: {
        premiumWarnPct: d.thresholds.premiumWarnPct,
        premiumBlockPct: d.thresholds.premiumBlockPct,
        slippageWarnPct: d.thresholds.slippageWarnPct,
        slippageResizePct: d.thresholds.slippageResizePct,
      },
    }
    return Response.json(body)
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : String(e), 502)
  }
}
