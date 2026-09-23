---
title: Steward
description: Guard-first advisor for tokenized stocks on BNB Smart Chain. Answers is-this-real, is-it-safe-to-buy, why-did-my-balance-change and compare-across-issuers, then hands back safe parameters and a verdict to execute through the Agentic Wallet.
metadata:
  version: 0.0.1
  author: zkasuran
license: MIT
---

<!--
Frontmatter is built to the documented Binance Web3 Wallet skill format (title, description, metadata
with version and author, license MIT). The exact field set is UNVERIFIED against the live
binance-skills-hub spec and is confirmed in the maintainer's session before publishing. This comment
does not render.
-->

# Steward

Steward is the own-side layer for a tokenized stock on BNB Smart Chain. Every other tool helps you buy
one. Steward tells you what you truly own, whether a buy is safe, why your balance moved and how the
same equity differs across issuers.

Steward is **advisory and guard-first**. It reads on-chain state and a reference feed, then returns a
verdict plus the safe parameters. It never signs and never sends. Executing a trade is a gated human
step you run through the Agentic Wallet CLI (`baw`) after you have read the verdict.

## Golden rules for the agent using this skill

1. **Resolve by beacon, never by symbol.** A "bStocks" symbol is heavily scam-squatted on BSC.
   Authenticity is decided on-chain by the EIP-1967 beacon, so a symbol only ever names a candidate.
2. **Guard before buy, always.** Never propose a swap without running the pre-trade guard first. A
   block means stop. A resize means shrink to the safe size before executing.
3. **Steward does not sign.** Present the plan and the verdict. The human runs `baw` to sign and send.
   Do not fabricate a signature, a transaction hash or a fill.
4. **Label mock data.** Reference-price and corporate-action readings default to a keyless mock
   (mock-until-key). Say so until the real Web3 API client is wired.
5. **Spot only.** This skill covers spot buys and read-only checks. It never proposes a perp or a
   margin-derivative position.

## Intent routing

Match the user's request to one intent, extract the parameters, then call the matching Steward action.

| Intent | Say it looks like | Steward action | Inputs |
| --- | --- | --- | --- |
| authenticity | "is this AAPLB real", "is 0x... a genuine bStock", "is NVDAB a scam" | `checkAuthenticity` | token symbol or 0x address |
| pretradeGuard | "is it safe to buy $100 of NVDAB now", "should I buy $500 of AAPLB" | `assessBuy` | token, USDT amount |
| corporateAction | "why did my balance change", "did I get a dividend on NVDAB" | `explainBalanceChange` | token, holder address |
| crossProvider | "compare TSLA across issuers", "bStocks vs Ondo vs xStocks for NVDA" | `compareAcrossIssuers` | underlying ticker |

If the request does not fit one of these, ask the user which one they mean rather than guessing.

## authenticity: is this token real

Call `checkAuthenticity(ref)`. It reads the token's beacon slot and compares it to the official
bStocks beacon. Report the plain-English headline. When it is not genuine, say plainly that it is a
look-alike and do not price it or trade it.

## pretradeGuard: is it safe to buy now

Call `assessBuy(ref, usdtIn)`. It composes four checks into one verdict: authenticity, premium to
reference NAV, depth and slippage from the pool and US market hours. The result carries an `action`
of allow, warn, resize or block, the reasons and a `plan` with safe parameters.

Then act on the action:

- **allow**: present the plan as is. The user may execute it.
- **warn**: present the warnings and the plan. Let the user decide with the risk stated.
- **resize**: do not execute the requested size. Present the smaller `amountUsdt` the plan suggests.
- **block**: do not execute. Explain why. There is no command in the plan.

The plan is a description of the swap, not an instruction Steward runs. Hand the user the
`execution.suggestedCommand` or the structured fields, to run in the Agentic Wallet themselves.

## corporateAction: why did my balance change

Call `explainBalanceChange(ref, holder)`. It reconstructs the position from Transfer history and
compares it to the live balance. A balance that grew with no matching transfer is a dividend or split
rebase, not a deposit and not a hack. It cross-references the reference corporate-action feed for the
reason and the amount. Reassure the user in plain words and name the corporate action behind it.

## crossProvider: compare across issuers

Call `compareAcrossIssuers(ref)`. It reads the same underlying across bStocks, Ondo and xStocks on
BSC: authenticity per family, on-chain USDT spot where a pool exists, depth and a tradeable flag.
State the rows, then state plainly that a cross-issuer arbitrage is NOT executable on today's BSC
liquidity, because Ondo pools are thin and xStocks pools are dust or absent. Never present the price
gap as a tradeable spread.

## Execution through the Agentic Wallet

Steward stops at the plan. The signed swap runs through the Agentic Wallet CLI (`baw`), which is where
the human reviews and approves the transaction. The plan carries the swap in structured fields plus a
suggested command of the shape:

```
baw swap --chain bsc --from USDT --to <symbol> --amount-in <usdt> --max-slippage-bps <bps>
```

The exact `baw` flags are UNVERIFIED and are confirmed against the installed Agentic Wallet before
first use. Steward never invokes `baw` for the user. It only prepares the arguments.

## Setup

This skill drives the `@steward/wallet-skill` module over the `@steward/sdk` reader. The on-chain
checks need no key. The reference-price and corporate-action checks use a keyless mock by default, so
the whole skill runs and demos with no Binance Web3 API key. Wire the real Web3 API client to switch
the reference readings from mock-until-key to live.
