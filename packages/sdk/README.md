# @steward/sdk

The typed core of Steward. It reads BNB Smart Chain to reason about owning a tokenized stock and it
holds the shared rules the rest of the suite depends on: resolve a token by its bStocks beacon, never
by symbol and never cache a balance, because bStocks rebase on dividends and splits.

Everything under `chain` is a plain BSC RPC read and needs no Binance Web3 API key.

## Build and test

```bash
npm run build -w @steward/sdk       # tsc to dist
npm run typecheck -w @steward/sdk
npm run smoke -w @steward/sdk        # live BSC read: 7 genuine bStocks pass, the scam clone fails
```

## What it exposes

Import from `@steward/sdk`. The core authenticity reader is flat, feature modules are namespaced to
keep the surface collision-free.

- Flat: `isGenuineBStock`, `readBeacon`, `readTokenMeta`, `makeClient`, `BSTOCKS_BEACON`,
  `BSTOCKS_CANDIDATES`, `RPC_ENDPOINTS`, `USDT` and the other chain constants.
- `market.*`: PancakeSwap v3 spot price, pool reserves, slippage of a USDT buy and US market hours.
- `ledger.*`: position reconstruction from Transfer history, FIFO acquisition lots, realized and
  unrealized basis and corporate-action detection from the gap between transfer-implied and live
  balances.
- `lending.*`: the Venus reads behind Swipe: collateral factor, liquidation threshold, oracle price
  and the largest health-factor-bounded USDT borrow against a bStocks position.
- `guard.*`: the pre-trade gate that folds authenticity, premium-to-NAV, depth and slippage and
  market hours into one verdict.
- `basket.*`: the thematic baskets, drift detection and rebalance math.
- `providers.*`: the bStocks vs Ondo vs xStocks comparison for one underlying.
- `api.*`: the `Web3ApiClient` interface, the keyless `MockWeb3ApiClient` and the non-calling
  `HttpWeb3ApiClient` skeleton, plus `instrumentWeb3Api` which logs every call for the DevEx session.

## Notes on RPC

The dataseed tier is fast for state reads but rejects `eth_getLogs`, so history scans route to a
log-serving tier (drpc for ranges up to 10000 blocks, publicnode as a fallback). See
`src/chain/constants.ts`. Pass a token's deploy block as the scan start rather than scanning from 0.

Licence: `LicenseRef-zkasuran-SAND-1.0`.
