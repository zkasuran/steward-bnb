# @steward/mcp

An MCP server over the Steward SDK. It exposes the read-only tokenized-stock tools to any MCP client
such as Cursor or Claude Code, so an agent or an IDE can reason about a bStocks holding as a tool
call. Every tool reads BNB Smart Chain or computes over what it read. Nothing signs, sends, spends or
holds a key.

## Build and run

```bash
npm run build -w @steward/mcp       # tsc to dist
node packages/mcp/dist/cli.js        # stdio server (or `npm start -w @steward/mcp`)
```

The bin is `steward-mcp`. Point your MCP client's stdio command at `node packages/mcp/dist/cli.js`.

## Tools

- `is_genuine_bstock`: verify a token by its EIP-1967 beacon slot, not its symbol. Returns the
  verdict, the observed beacon, the expected beacon and token metadata.
- `position_ledger`: reconstruct a holder's true position across bStocks from Transfer history:
  acquisition lots, net units and corporate-action rebases. Scans a bounded recent window by default.
- `pre_trade_guard`: the pre-trade gate for a USDT buy: authenticity, premium-to-NAV, depth and
  slippage and market hours folded into allow, warn, resize or block.
- `market_quote`: live PancakeSwap v3 price, depth and reserves at a pinned block, plus estimated
  slippage for a given USDT size and whether the US session is open.
- `compare_providers`: the same underlying across bStocks, Ondo and xStocks, priced where a pool
  exists, stating plainly that a cross-provider arb is not executable today.
- `list_baskets` and `analyze_basket`: the shipped thematic baskets and their value, weights and
  drift against a holder's wallet.
- `swipe_quote`: the largest safe USDT borrow against a bStocks position on Venus at a target health
  factor. Spot collateral, not a perp.

The premium-to-NAV leg of `pre_trade_guard` uses a keyless `MockWeb3ApiClient` reference price until
the Binance Web3 API key is wired. Its output says so. Every other leg is a live BSC read.

Licence: `LicenseRef-zkasuran-SAND-1.0`.
