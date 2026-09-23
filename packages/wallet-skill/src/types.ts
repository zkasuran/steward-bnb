// Shared types for the Steward Wallet Skill. This skill is ADVISORY and guard-first: every handler
// returns a plain-English answer, the structured reading behind it and where a trade is involved a
// TradePlan with safe parameters. It NEVER signs or sends. The signed swap through the Agentic Wallet
// CLI (baw) is a gated human step, so `signed` is a literal false everywhere below.
import type { Address, PublicClient } from "viem"
import type { api, guard, ledger, providers } from "@steward/sdk"

// The four intents Steward routes.
export type StewardIntent = "authenticity" | "pretradeGuard" | "corporateAction" | "crossProvider"

// Reference-dependent checks call this client. It defaults to a keyless mock (mock-until-key), so the
// skill runs, tests and demos with no Binance Web3 API key. Swap in the real client once it is wired.
export interface SkillContext {
  api?: api.Web3ApiClient
  publicClient?: PublicClient
  now?: Date
}

// Where an answer's numbers came from, so a caller can label a mock reading honestly.
export type DataSource =
  | "on-chain"
  | "on-chain + reference"
  | "on-chain + reference (mock-until-key)"
  | "reference"
  | "reference (mock-until-key)"

// The gated execution plan handed back for a buy. The skill never signs: this only describes the swap
// a human runs through the Agentic Wallet. `signed` and `gatedHumanStep` keep that explicit in the data.
export interface TradePlan {
  decision: "execute" | "resize-then-execute" | "do-not-execute"
  fromToken: { symbol: string; address: Address }
  toToken: { symbol?: string; address: Address }
  requestedUsdt: number
  amountUsdt: number
  maxSlippagePct?: number
  quote: Address
  chain: "bsc"
  signed: false
  execution: {
    surface: "agentic-wallet"
    cli: "baw"
    // UNVERIFIED: the exact baw flags are confirmed in the human's Agentic Wallet session.
    suggestedCommand: string | null
    gatedHumanStep: true
  }
}

// One consistent envelope for every handler and the router.
export interface SkillResult<TData> {
  intent: StewardIntent | "unknown"
  ok: boolean
  advisory: true
  signed: false
  headline: string
  detail: string[]
  data: TData
  plan?: TradePlan
  dataSource: DataSource
  notes: string[]
}

// Convenience aliases so callers do not reach into the SDK namespaces themselves.
export type GuardVerdict = guard.GuardVerdict
export type PositionLedger = ledger.PositionLedger
export type CrossProviderComparison = providers.CrossProviderComparison

// A parsed natural-language request. classifyIntent fills what it can read off the text; a caller can
// override any field. `holder` for the balance-change intent usually comes from the connected wallet.
export interface ClassifiedIntent {
  intent: StewardIntent | "unknown"
  symbol?: string
  token?: Address
  underlying?: string
  usdtIn?: number
  holder?: Address
  confidence: "high" | "low"
  note: string
}
