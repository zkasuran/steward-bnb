// USE / Swipe: quote the largest safe USDT borrow against a supplied bStock on Venus, at a
// target health factor. This is SPOT collateralised borrowing, not a perp and not margin: the
// holder keeps the bStock and draws USDT against it. Every number is a live Venus read (listing,
// collateral factor, liquidation threshold, oracle price, available liquidity). Reads only: this
// route encodes nothing and sends nothing.
import { lending } from "@steward/sdk"
import { BSC_CHAIN_ID } from "@/lib/format"
import { parseAddress, errorJson } from "@/lib/sdk-server"
import type { SwipeResponse } from "@/lib/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const LISTED = new Set(["TSLAB", "NVDAB", "SPCXB", "SKHYB"])

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const marketRef = (url.searchParams.get("market") ?? "TSLAB").trim()
  const collateralUnits = Number(url.searchParams.get("units") ?? "10")
  const targetHealthFactor = Number(url.searchParams.get("hf") ?? "2")
  const accountParam = url.searchParams.get("account")

  if (!LISTED.has(marketRef.toUpperCase()) && !parseAddress(marketRef)) {
    return errorJson("Pass ?market= as one of TSLAB, NVDAB, SPCXB, SKHYB or a market address")
  }
  if (!Number.isFinite(collateralUnits) || collateralUnits < 0) {
    return errorJson("Pass ?units= as the bStock amount supplied as collateral")
  }
  if (!Number.isFinite(targetHealthFactor) || targetHealthFactor <= 0) {
    return errorJson("Pass ?hf= as a target health factor greater than 0, e.g. 2")
  }
  let account: string | undefined
  if (accountParam) {
    const a = parseAddress(accountParam)
    if (!a) return errorJson("?account= is not a valid address")
    account = a
  }

  try {
    const q = await lending.readSwipeQuote({ market: marketRef, collateralUnits, targetHealthFactor, account })
    const body: SwipeResponse = {
      chainId: BSC_CHAIN_ID,
      market: {
        symbol: q.market.symbol,
        vToken: q.market.vToken,
        underlying: q.market.underlying,
        genuineBStock: q.market.genuineBStock,
        isListed: q.market.isListed,
        collateralFactor: q.market.collateralFactor,
        liquidationThreshold: q.market.liquidationThreshold,
        priceUsd: q.market.priceUsd,
        atBlock: q.market.atBlock,
      },
      collateralUnits,
      collateralValueUsd: q.collateralValueUsd,
      existingUsdtBorrowUsd: q.existingUsdtBorrowUsd,
      availableUsdtLiquidityUsd: q.availableUsdtLiquidityUsd,
      plan: {
        weightedCollateralUsd: q.plan.weightedCollateralUsd,
        borrowLimitUsd: q.plan.borrowLimitUsd,
        targetHealthFactor: q.plan.targetHealthFactor,
        maxSafeBorrowUsd: q.plan.maxSafeBorrowUsd,
        healthFactorAtMaxSafeBorrow: q.plan.healthFactorAtMaxSafeBorrow,
        bound: q.plan.bound,
      },
      fundableBorrowUsd: q.fundableBorrowUsd,
    }
    return Response.json(body)
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : String(e), 502)
  }
}
