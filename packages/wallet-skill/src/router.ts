// A lightweight natural-language router. SKILL.md is the primary router an agent reads to map intent to
// a tool call; this classifier is a programmatic fallback for scripted use and demos. It is a keyword
// heuristic, labeled honestly: `confidence` is "low" when the match is weak or a needed field is missing.
import type { Address } from "viem"
import { KNOWN_BSTOCK_SYMBOLS, KNOWN_UNDERLYINGS } from "./resolve.js"
import { checkAuthenticity } from "./handlers/authenticity.js"
import { assessBuy } from "./handlers/pretrade.js"
import { explainBalanceChange } from "./handlers/corporate-action.js"
import { compareAcrossIssuers } from "./handlers/cross-provider.js"
import type { ClassifiedIntent, SkillContext, SkillResult, StewardIntent } from "./types.js"

const ADDRESS_G = /0x[0-9a-fA-F]{40}/
const AMOUNT_RE = /\$\s?([0-9][0-9,]*(?:\.[0-9]+)?)|([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:usdt|usd|dollars?)/i

function findSymbol(text: string): { symbol?: string; underlying?: string } {
  const upper = text.toUpperCase()
  for (const s of KNOWN_BSTOCK_SYMBOLS) {
    if (new RegExp(`\\b${s}\\b`).test(upper)) return { symbol: s }
  }
  for (const u of KNOWN_UNDERLYINGS) {
    if (new RegExp(`\\b${u}\\b`).test(upper)) return { underlying: u }
  }
  return {}
}

function findAmount(text: string): number | undefined {
  const m = AMOUNT_RE.exec(text)
  if (!m) return undefined
  const raw = (m[1] ?? m[2] ?? "").replace(/,/g, "")
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

// Read a Steward intent and its parameters off a natural-language line. Best effort: a caller should
// confirm the parameters and supply a holder for the balance-change intent before acting.
export function classifyIntent(utterance: string): ClassifiedIntent {
  const text = utterance.trim()
  const addr = ADDRESS_G.exec(text)?.[0] as Address | undefined
  const { symbol, underlying } = findSymbol(text)
  const usdtIn = findAmount(text)

  let intent: StewardIntent | "unknown" = "unknown"
  if (/balance|rebase|dividend|split|corporate action|why did|why do|grew|shrunk|shrank|increased|dropped|more tokens/i.test(text)) {
    intent = "corporateAction"
  } else if (/compare|across|issuer|provider|ondo|xstock/i.test(text)) {
    intent = "crossProvider"
  } else if (/safe to (buy|trade)|should i buy|ok to buy|\bbuy\b|slippage|premium|pre-?trade/i.test(text) || usdtIn !== undefined) {
    intent = "pretradeGuard"
  } else if (/\breal\b|genuine|authentic|legit|scam|fake|fraud|verify|is this/i.test(text)) {
    intent = "authenticity"
  }

  const hasToken = Boolean(addr || symbol || underlying)
  let confidence: "high" | "low" = "low"
  if (intent === "pretradeGuard") confidence = hasToken && usdtIn !== undefined ? "high" : "low"
  else if (intent === "crossProvider") confidence = symbol || underlying ? "high" : "low"
  else if (intent !== "unknown") confidence = hasToken ? "high" : "low"

  return {
    intent,
    symbol,
    token: addr,
    underlying,
    usdtIn,
    confidence,
    note:
      intent === "unknown"
        ? "Could not map this to a Steward intent. Route it manually to authenticity, pretradeGuard, corporateAction or crossProvider."
        : `Classified as ${intent} by keyword heuristic. Confirm the parameters before acting.`,
  }
}

export interface RunOptions {
  holder?: Address
  usdtIn?: number
  fromBlock?: bigint
  toBlock?: bigint
}

function needField(intent: StewardIntent | "unknown", what: string): SkillResult<null> {
  return {
    intent,
    ok: false,
    advisory: true,
    signed: false,
    headline: `Missing ${what}.`,
    detail: [`Steward needs ${what} to answer this. Provide it and retry.`],
    data: null,
    dataSource: "on-chain",
    notes: [],
  }
}

// Classify then dispatch. Returns the handler's result or an ok:false result naming the missing field.
export async function runIntent(utterance: string, ctx: SkillContext = {}, opts: RunOptions = {}): Promise<SkillResult<unknown>> {
  const c = classifyIntent(utterance)
  const ref = c.token ?? c.symbol ?? c.underlying

  switch (c.intent) {
    case "authenticity":
      if (!ref) return needField("authenticity", "a token symbol or 0x address")
      return checkAuthenticity(ref, ctx)
    case "pretradeGuard": {
      const amount = opts.usdtIn ?? c.usdtIn
      if (!ref) return needField("pretradeGuard", "a token symbol or 0x address")
      if (amount === undefined) return needField("pretradeGuard", "a USDT amount, e.g. $100")
      return assessBuy(ref, amount, ctx)
    }
    case "corporateAction": {
      if (!ref) return needField("corporateAction", "a token symbol or 0x address")
      if (!opts.holder) return needField("corporateAction", "the holder wallet address (usually the connected wallet)")
      return explainBalanceChange(ref, opts.holder, ctx, { fromBlock: opts.fromBlock, toBlock: opts.toBlock })
    }
    case "crossProvider": {
      const u = c.underlying ?? c.symbol ?? c.token
      if (!u) return needField("crossProvider", "an underlying ticker, e.g. TSLA")
      return compareAcrossIssuers(u, ctx)
    }
    default:
      return needField("unknown", "a clearer request that names one of the four Steward intents")
  }
}
