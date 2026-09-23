// Intent: "compare TSLA across issuers". Read the same underlying across bStocks, Ondo and xStocks on
// BSC: live authenticity per family, on-chain USDT spot where a pool exists and an honest depth and
// tradeable flag. Read-only. It states plainly that a cross-issuer DEX arbitrage is NOT executable on
// today's BSC liquidity. No key, no transaction, no signing.
import { providers } from "@steward/sdk"
import { resolveContext } from "../context.js"
import { resolveUnderlying } from "../resolve.js"
import type { CrossProviderComparison, SkillContext, SkillResult } from "../types.js"

export async function compareAcrossIssuers(ref: string, ctx: SkillContext = {}): Promise<SkillResult<CrossProviderComparison>> {
  const underlying = resolveUnderlying(ref)
  const rc = resolveContext(ctx)
  const comparison = await providers.compareProviders(underlying, { client: rc.publicClient })

  const detail: string[] = []
  const none = comparison.representations.length === 0
  if (none) {
    detail.push(`No known bStocks, Ondo or xStocks representation for "${underlying}" on BSC. Known underlyings: ${providers.KNOWN_UNDERLYINGS.join(", ")}.`)
  } else {
    for (const rep of comparison.representations) {
      const price = rep.spotUsdt !== null ? `$${rep.spotUsdt.toFixed(2)}` : "no on-chain USDT pool"
      const auth = rep.authentic ? "authentic" : "NOT authentic"
      const trad = rep.tradeable ? "tradeable" : "not tradeable in size on BSC"
      detail.push(`${rep.family}: ${auth}, ${price}, depth ${rep.depth}, ${trad}. ${rep.liquidityNote}`)
    }
    detail.push(comparison.honesty)
  }

  return {
    intent: "crossProvider",
    ok: true,
    advisory: true,
    signed: false,
    headline: none
      ? `No cross-issuer representation found for "${underlying}".`
      : `${underlying} across issuers on BSC. A cross-issuer arbitrage is not executable here.`,
    detail,
    data: comparison,
    dataSource: "on-chain",
    notes: [],
  }
}
