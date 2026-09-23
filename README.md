# Steward

The own-side layer for a tokenized stock on BNB Smart Chain. Every other tool helps you buy one.
Steward is the whole life of the holding after that: know what you truly own, grow it on your
convictions, use it and compare it across issuers. Own-side, not buy-side.

Steward centers **bStocks**, the Binance-family tokenized equities that trade on real PancakeSwap
depth on BSC. It is spot only. No perps, no margin loops. Every reading is a live BNB Smart Chain
read or a computation over one, so the core runs with no API key and no gas.

## The four pillars

- **Know**: see the truth. Resolve every token by its bStocks beacon, never by symbol, so a
  scam clone is caught before it costs anything. Reconstruct true cost basis, realized and
  unrealized position and dividend income from Transfer history. Detect the silent rebase that
  moves a balance on a dividend or split.
- **Grow**: own convictions. Thematic baskets ("AI chips", "Mag 7") expressed as a rule over
  genuine bStocks, with drift detection and a rebalance plan. Execution is a separate guarded step.
- **Use**: live off it, safely. A pre-trade guard folds authenticity, premium-to-NAV, pool
  depth and slippage and US market hours into one verdict (allow, warn, resize or block). Swipe
  borrows USDT against a bStocks position on Venus without selling it, spot collateral, not a perp.
- **Compare**: the same underlying across bStocks (deep), Ondo (thin) and xStocks (dust), read
  only. It states plainly that a cross-provider DEX arb is not executable on today's BSC liquidity.

## The suite

| Package | Name | What it is |
| --- | --- | --- |
| `packages/sdk` | `@steward/sdk` | The typed core. On-chain reader (authenticity, ledger, market, Venus, cross-provider), guard and basket math and a `Web3ApiClient` interface with a keyless mock adapter. Everything else imports this. |
| `packages/mcp` | `@steward/mcp` | An MCP server that exposes the read-only tools (authenticity, ledger, guard, market, cross-provider, baskets, swipe) to any MCP client such as Cursor or Claude Code. |
| `apps/web` | `@steward/web` | The Next.js dashboard. The non-crypto-native front door, four tabs over live BSC reads, deployable to a free host. |
| `packages/wallet-skill` | `@steward/wallet-skill` | A Binance Web3 Wallet skill that routes four natural-language intents to the SDK and hands back a verdict plus safe parameters. Advisory, never signs. |
| `packages/agent` | `@steward/agent` | The Agent Studio agent (Leash and Paycheck): ERC-8004 identity, an ERC-8183 job model and b402 self-funding, building unsigned transactions only. |

## Quickstart

```bash
npm install          # install the workspace (packages/* and apps/*)
npm run build        # build every package with tsc, plus the Next.js app
npm test             # run the unit tests (node:test, no extra runner)
npm run smoke        # live BSC mainnet smoke: 7 genuine bStocks resolve, the scam clone is rejected
```

Run the dashboard:

```bash
npm run dev -w @steward/web      # http://localhost:3000
```

Run the MCP server (stdio) after a build:

```bash
node packages/mcp/dist/cli.js        # or `npm start -w @steward/mcp`, bin name: steward-mcp
```

Dry-run the Agent Studio agent after a build. It reads the chain and the keyless mock, prints the
identity, the Leash rebalance plan and the Paycheck preview, then exits. It signs and sends nothing:

```bash
node packages/agent/dist/run.js once 0xDB6c6340342e71A63cD11Ebac2185204b7777777 ai-chips
```

## Verified on-chain facts

These were read from BNB Smart Chain (chain id 56), not copied from a blog. Re-verify before quoting
them anywhere it matters, because the governable ones move on a vote.

- **bStocks beacon** `0x156d6DCe9A4F6139a3406F1f021F1a4880dE93A3`. Every genuine bStocks token is a
  beacon proxy pointing here. Authenticity is a read of the token's EIP-1967 beacon slot compared to
  this address. BscScan: https://bscscan.com/address/0x156d6DCe9A4F6139a3406F1f021F1a4880dE93A3
- **Venus collateral markets** (genuine bStocks usable as spot collateral for a USDT borrow):
  - TSLAB vToken `0x97421799419Eb782628e73e7220d8E0A207469a3`, underlying `0x5b1910eAaD6450E50f816082Aa078C41F10C292f`
  - NVDAB vToken `0xEb8Ca841cBe1BC4832A10b15c7dAB1081eDaD371`, underlying `0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436`
  - SPCXB vToken `0xC36dFaCc7a125859C106F29b9F2d874CCF29A55A`, underlying `0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1`
  - SKHYB vToken `0x3E281461efb3D53EC20DB207674373Ed8Ef3BbA9`, underlying `0xCA750eF65f295BBECd685Abf54e82CAf297BDB61`
- **ERC-8004 Identity Registry** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`. name() "AgentIdentity",
  symbol() "AGENT", ERC-721. The agent's registration transaction targets this contract.

## What is live vs gated

Steward is built to be honest about what a judge can run today with no key and no funds.

- **Live and free.** Every on-chain read: authenticity by beacon, the position ledger from Transfer
  history, PancakeSwap v3 price, depth and slippage, the Venus market reads behind Swipe and the
  cross-provider comparison. No key, no gas. The dashboard and the MCP server run on these today.
- **Behind the interface, keyless mock for now.** The Binance Web3 API (the reference price for
  premium-to-NAV and the corporate-action feed) sits behind a `Web3ApiClient` interface with a
  `MockWeb3ApiClient` adapter. The whole suite runs, tests and demos with the mock. Every mock
  value is labelled as such in the output. The real `HttpWeb3ApiClient` activates when the API key is
  wired. Its endpoint and field names are marked UNVERIFIED in the source until a keyed session
  confirms them.
- **Gated on gas or a key.** Live trades and on-chain deploys need BNB for gas and a signing key. The
  house wallet BNB balance is 0, so the SDK and the agent build unsigned transactions and stop at the
  signing line. Every such step is surfaced as one ready command, never run for you.
- **Draft, not deployed.** ERC-8183 is a draft with no deployed contract on BSC, so the agent's job
  model follows the draft shape and is marked as such. The ERC-8004 Reputation Registry read is
  best-effort and flagged UNVERIFIED.

## Licence

The suite is source-available, no derivatives, under `LicenseRef-zkasuran-SAND-1.0` (see `LICENSE`).
It is an entry, not a contribution, so redistribution and derivative works are withheld while you may
run it, read it and benchmark it. The one exception is `@steward/wallet-skill`, which is **MIT**, so
it can be adopted into the Binance skills hub. Third-party components keep their own terms, listed in
`NOTICE`. Lineage is recorded in `PROVENANCE.json`.

## AI assistance

AI (Claude, Anthropic) was used in building this suite. The design, the on-chain verification and the
review are the author's. On-chain facts were checked against BSC mainnet before they were relied on,
and the Developer Experience Report submitted alongside this entry is a separate, human-written
account. Nothing in this repo signs, sends or spends.

