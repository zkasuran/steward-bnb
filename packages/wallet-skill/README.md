# @steward/wallet-skill

A Binance Web3 Wallet skill for tokenized stocks on BNB Smart Chain. It routes four natural-language
intents to the Steward SDK and hands back a plain-English answer plus the structured reading behind
it. It is guard-first and advisory. It never signs or sends. It produces safe parameters and a
verdict. The signed swap through the Agentic Wallet is the gated human step.

## Build

```bash
npm run build -w @steward/wallet-skill
npm run typecheck -w @steward/wallet-skill
```

The skill catalog is `SKILL.md` (frontmatter plus the intent descriptions). The frontmatter follows
the documented Binance Web3 Wallet skill format and is confirmed against the live hub spec before
publishing.

## Intents

- **authenticity**: "is this AAPLB real" resolves to a beacon check.
- **pretradeGuard**: "is it safe to buy $100 of NVDAB now" returns a guard verdict and a safe trade
  plan.
- **corporateAction**: "why did my balance change" explains a rebase, dividend or split.
- **crossProvider**: "compare TSLA across issuers" returns bStocks vs Ondo vs xStocks, read only.

## What it exposes

`INTENTS` (the catalog), `checkAuthenticity`, `assessBuy`, `explainBalanceChange`,
`compareAcrossIssuers`, the router and the intent types. Reference-dependent checks default to a
keyless mock so the skill runs, tests and demos with no Binance Web3 API key.

Licence: **MIT** (see `LICENSE`). This package is MIT rather than the suite's source-available licence
so it can be adopted into the Binance skills hub.
