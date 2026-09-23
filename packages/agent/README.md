# @steward/agent

The Steward Agent Studio agent. It runs two of the suite's Grow features as a guarded runtime: Leash
(a rebalance decision loop kept inside hard limits) and Paycheck (routing a tracked dividend as a
b402 payment). It carries an ERC-8004 on-chain identity and an ERC-8183 job model.

Every write in this package is an unsigned transaction builder. It holds no key, spends no gas and
sends nothing. The signing and the sending are the gated human step.

## Build and dry-run

```bash
npm run build -w @steward/agent
node packages/agent/dist/run.js once 0xDB6c6340342e71A63cD11Ebac2185204b7777777 ai-chips
```

The dry-run reads BSC mainnet and the keyless mock, then prints three things and exits:

1. **Identity (ERC-8004)**: the agent card and the unsigned `register` transaction targeting the
   Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, plus a live registry read.
2. **Leash decision loop**: a rebalance proposal over a basket, each leg clamped to a ticker
   allowlist, a per-position cap, a daily budget and a drift threshold, with the guard verdict on it.
3. **Paycheck (b402)**: a dividend routed as a b402 payment requirement over USD1, reconciled but
   not settled.

The basket id is one of `ai-chips`, `mag7-ish` or `index`. The address defaults to the house wallet.

## What it exposes

`buildStewardAgentCard`, `buildRegisterTx`, `resolveAgent` (identity), `decideLeash` and `LeashLimits`
(the decision loop), `routeDividendIncome` (Paycheck), the unsigned tx builders in `tx` and the
verified constants in `constants`.

## Verified vs gated

The Identity Registry and the USD1 EIP-712 domain were read on chain. ERC-8183 has no deployed
contract on BSC, so the job model follows the draft and is marked as such. The Reputation Registry
read is flagged UNVERIFIED. b402 mainnet settlement is granted on request, so the package builds the
signed authorization shape and the unsigned settle transaction, then stops.

Licence: `LicenseRef-zkasuran-SAND-1.0`.
