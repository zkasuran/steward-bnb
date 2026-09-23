# @steward/web

The Steward dashboard. A Next.js app, the non-crypto-native front door to owning a tokenized stock on
BNB Chain. Four tabs over the whole life of a holding: Know the truth, Grow on convictions, Use it
safely and Compare it across providers.

Every panel reads BSC mainnet through server route handlers, so the browser never touches an RPC. The
reads are live and free. Rebalance and borrow are plan-only quotes. Reference price and portfolio
value are a keyless mock until the Web3 API key is wired. Every mock value is labelled.

## Run

```bash
npm run dev -w @steward/web      # http://localhost:3000
npm run build -w @steward/web    # next build
npm run start -w @steward/web    # serve the production build
```

## What it renders

- **Know**: holdings resolved by beacon (genuine vs look-alike) and the true-position ledger.
- **Grow**: thematic baskets, current weights and drift against target.
- **Use**: the pre-trade guard verdict for a USDT buy and the Swipe borrow quote on Venus.
- **Compare**: the same underlying across bStocks, Ondo and xStocks.

Server routes live under `app/api/*` and read the chain through `@steward/sdk`. Nothing in the app
signs, sends or spends. It is not affiliated with, endorsed by or partnered with BNB Chain or Binance.

Licence: `LicenseRef-zkasuran-SAND-1.0`.
