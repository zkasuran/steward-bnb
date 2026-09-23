// @steward/wallet-skill. The Steward Wallet Skill.
//
// A guard-first, advisory skill for tokenized stocks on BNB Smart Chain. It routes four natural-language
// intents to the Steward SDK and returns a plain-English answer plus the structured reading behind it:
//
//   authenticity     "is this AAPLB real"                -> beacon check
//   pretradeGuard     "is it safe to buy $100 of NVDAB now" -> guard verdict + a safe TradePlan
//   corporateAction   "why did my balance change"         -> rebase/dividend explainer
//   crossProvider     "compare TSLA across issuers"        -> bStocks vs Ondo vs xStocks, read-only
//
// It NEVER signs or sends. It produces the safe parameters and the verdict; the signed swap through the
// Agentic Wallet CLI (baw) is the gated human step. Reference-dependent checks default to a keyless mock
// (mock-until-key) so the whole skill runs, tests and demos with no Binance Web3 API key.
export * from "./types.js"
export * from "./context.js"
export * from "./resolve.js"
export * from "./router.js"
export { checkAuthenticity, type AuthenticityData } from "./handlers/authenticity.js"
export { assessBuy } from "./handlers/pretrade.js"
export { explainBalanceChange, type CorporateActionData, type BalanceChangeOptions } from "./handlers/corporate-action.js"
export { compareAcrossIssuers } from "./handlers/cross-provider.js"

import type { StewardIntent } from "./types.js"

export const SKILL_VERSION = "0.0.1"

export interface IntentSpec {
  intent: StewardIntent
  title: string
  examples: string[]
  handler: string
  signs: false
}

// The catalog SKILL.md and any tool host route against. Every intent is advisory and none of them sign.
export const INTENTS: readonly IntentSpec[] = [
  {
    intent: "authenticity",
    title: "Is this token real",
    examples: ["is this AAPLB real", "is 0x431a3BEE82E2ca41e49895CbECE5bB0F76A89b7A a genuine bStock", "is NVDAB a scam"],
    handler: "checkAuthenticity(ref, ctx)",
    signs: false,
  },
  {
    intent: "pretradeGuard",
    title: "Is it safe to buy now",
    examples: ["is it safe to buy $100 of NVDAB now", "should I buy $500 of AAPLB", "pre-trade check TSLAB $50"],
    handler: "assessBuy(ref, usdtIn, ctx)",
    signs: false,
  },
  {
    intent: "corporateAction",
    title: "Why did my balance change",
    examples: ["why did my AAPLB balance change", "did I get a dividend on NVDAB", "why do I have more TSLAB tokens"],
    handler: "explainBalanceChange(ref, holder, ctx, opts)",
    signs: false,
  },
  {
    intent: "crossProvider",
    title: "Compare across issuers",
    examples: ["compare TSLA across issuers", "bStocks vs Ondo vs xStocks for NVDA", "which provider has AAPL on BSC"],
    handler: "compareAcrossIssuers(ref, ctx)",
    signs: false,
  },
] as const
