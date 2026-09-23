// `run once`: execute the Leash decision loop against a supplied address using live BSC reads and the
// keyless mock Web3 API, print the proposed plan and the Paycheck preview, then exit. It reads the
// chain, it never writes it. No key, no gas, no transaction leaves this process.
//
//   node dist/run.js once <address> [basketId]
//
// basketId is one of the SDK example baskets (ai-chips, mag7-ish, index). The address defaults to the
// house wallet when omitted or malformed.
import { getAddress, isAddress } from "viem"
import { makeClient, api as sdkApi, basket as sdkBasket } from "@steward/sdk"
import { HOUSE_WALLET } from "./constants.js"
import { buildStewardAgentCard } from "./card.js"
import { buildRegisterTx, resolveAgent } from "./identity.js"
import { decideLeash, type LeashLimits } from "./leash.js"
import { routeDividendIncome } from "./paycheck.js"

const ORIGIN = "https://steward.zkasuran.dev"

function head(title: string): void {
  console.log(`\n=== ${title} ===`)
}

function printUsage(): void {
  console.log("usage: node dist/run.js once <address> [basketId]")
  console.log(`baskets: ${Object.keys(sdkBasket.BASKETS_BY_ID).join(", ")}`)
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const cmd = argv[0] ?? "once"
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printUsage()
    return
  }
  if (cmd !== "once") {
    printUsage()
    process.exitCode = 1
    return
  }

  const address = argv[1] && isAddress(argv[1]) ? getAddress(argv[1]) : HOUSE_WALLET
  const basketId = argv[2] ?? "ai-chips"
  const chosen = sdkBasket.BASKETS_BY_ID[basketId]
  if (!chosen) {
    console.error(`unknown basket "${basketId}". Known: ${Object.keys(sdkBasket.BASKETS_BY_ID).join(", ")}`)
    process.exitCode = 1
    return
  }

  const apiClient = new sdkApi.MockWeb3ApiClient()
  const client = makeClient()

  console.log(`Steward Agent Studio agent (Leash + Paycheck) dry run`)
  console.log(`holder ${address} | basket ${chosen.id} | api MockWeb3ApiClient (keyless) | chain BSC mainnet`)

  // 1. IDENTITY (ERC-8004): the agent card and the UNSIGNED registration transaction.
  head("Identity (ERC-8004)")
  const card = buildStewardAgentCard({ origin: ORIGIN })
  console.log(`agent card: ${JSON.stringify(card).length} bytes, skills ${(card["skills"] as unknown[]).length}`)
  const reg = buildRegisterTx({ origin: ORIGIN, payTo: HOUSE_WALLET })
  console.log(`register tx (UNSIGNED, gated): to=${reg.tx.to} fn="${reg.tx.signature}"`)
  console.log(`  requires: ${reg.tx.requires.join("; ")}`)
  console.log(`  tokenURI: ${reg.tokenUri.slice(0, 72)}...`)
  try {
    const agent1 = await resolveAgent(1n, client)
    console.log(`live registry read ok: agentId 1 owner=${agent1.owner} name=${agent1.registration?.name ?? "(none)"}`)
  } catch (e) {
    console.log(`live registry read skipped: ${(e as Error).message.slice(0, 80)}`)
  }

  // 2. DECISION LOOP (Leash): guard-railed rebalance proposal inside hard limits.
  head("Leash decision loop")
  const limits: LeashLimits = {
    tickerAllowlist: Object.keys(chosen.weights).map((t) => t.toUpperCase()),
    perPositionCapUsd: 250,
    dailyBudgetUsd: 500,
    driftThresholdPct: 5,
  }
  const plan = await decideLeash({ holder: address, basket: chosen, limits, api: apiClient, client })
  console.log(`portfolio $${plan.portfolioValueUsd.toFixed(2)} at block ${plan.atBlock ?? "?"} | complete=${plan.complete}`)
  console.log(`corporate actions seen: ${plan.corporateActions.length}`)
  for (const a of plan.actions) {
    console.log(`  ${a.side.toUpperCase()} ${a.ticker}: requested $${a.requestedUsd.toFixed(2)} -> approved $${a.approvedUsd.toFixed(2)} [${a.status}${a.guardAction ? "/guard:" + a.guardAction : ""}]`)
    for (const r of a.reasons) console.log(`      - ${r}`)
  }
  console.log(`approved buys $${plan.approvedBuyUsd.toFixed(2)} | sells $${plan.approvedSellUsd.toFixed(2)} | withinLimits=${plan.withinLimits} | gated=${plan.gated}`)
  console.log(plan.note)

  // 3. PAYCHECK (b402): route a tracked dividend as a b402 payment over USD1. Nothing settles.
  head("Paycheck (b402 income rail)")
  const pay = await routeDividendIncome({ amountAtomic: "250000000000000000", resource: "/paycheck/dividend", api: apiClient })
  console.log(`requirement: ${pay.requirement.amount} atomic ${pay.requirement.extra.name} to ${pay.requirement.payTo} (scheme ${pay.requirement.scheme})`)
  console.log(`reconciliation: ${pay.reconciliation}`)
  console.log(`requires: ${pay.requires.join("; ")}`)
  console.log(pay.note)

  console.log(`\nDone. No transaction was signed or sent.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
