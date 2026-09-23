// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
//
// Steward MCP server: the read-only surface over @steward/sdk. Every tool here reads BNB Smart Chain
// or computes over what it read. Nothing signs, sends, spends, holds a key or calls an authenticated
// Binance Web3 API. Tokens are resolved by their on-chain bStocks beacon, never by symbol. A bStocks
// balance is never cached because it rebases on dividends and splits. One reference-price leg
// (pre_trade_guard) runs against a keyless MockWeb3ApiClient until the Binance Web3 API key is wired.
// It says so in its output.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { getAddress, type Address } from "viem"
import { z } from "zod"

import {
  isGenuineBStock,
  readBeacon,
  readTokenMeta,
  makeClient,
  BSTOCKS_BEACON,
  market,
  ledger,
  guard,
  basket,
  providers,
  lending,
  api,
} from "@steward/sdk"

const NETWORK_READS = { readOnlyHint: true, openWorldHint: true } as const
const STATIC_READS = { readOnlyHint: true, openWorldHint: false } as const

const tokenArg = z
  .string()
  .describe("A bStock token address (0x-prefixed, 20 bytes). Resolved by beacon, never by symbol.")
const holderArg = z
  .string()
  .describe("The wallet address whose position is read (0x-prefixed, 20 bytes).")

// bStocks rebase and their balances are bigint, which JSON cannot serialise. Render every bigint
// as a decimal string rather than dropping the field.
function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value
}

function ok(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, jsonReplacer, 2) }] }
}

function toolError(error: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
    isError: true,
  }
}

// Run one handler, turning a fail-closed throw into a clear tool error rather than a transport crash.
async function run(fn: () => unknown | Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn())
  } catch (error) {
    return toolError(error)
  }
}

// Validate and checksum an address at the tool boundary, so a bad input becomes a plain tool error
// instead of a deep SDK throw.
function toAddress(value: string): Address {
  return getAddress(value.trim())
}

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "steward-mcp", version: "0.0.1" },
    {
      instructions:
        "Steward (BNB tokenized stocks): read-only tools to reason over tokenized US stocks on BNB " +
        "Smart Chain. Tokens are resolved by their on-chain bStocks beacon, never by symbol. A " +
        "bStocks balance is never cached because it rebases on dividends and splits. Every tool only " +
        "reads the chain or computes; none signs, sends, spends or holds a key. The premium-to-NAV " +
        "leg of pre_trade_guard uses a keyless mock reference price until the Binance Web3 API key is " +
        "wired.",
    },
  )

  server.registerTool(
    "is_genuine_bstock",
    {
      description:
        "Verify a token is a genuine bStocks stock token by its EIP-1967 beacon slot, not its symbol. " +
        "Returns the verdict, the observed beacon, the expected beacon and token metadata when readable.",
      annotations: NETWORK_READS,
      inputSchema: { token: tokenArg },
    },
    (args) =>
      run(async () => {
        const client = makeClient()
        const token = toAddress(args.token)
        const [genuine, beacon] = await Promise.all([
          isGenuineBStock(client, token),
          readBeacon(client, token),
        ])
        let meta: Awaited<ReturnType<typeof readTokenMeta>> | null = null
        try {
          meta = await readTokenMeta(client, token)
        } catch {
          meta = null
        }
        return {
          token,
          genuine,
          method: "eip1967-beacon",
          observedBeacon: beacon,
          expectedBeacon: BSTOCKS_BEACON,
          meta,
          verdict: genuine
            ? "Genuine bStocks token: its beacon slot points at the official bStocks beacon."
            : "Not a genuine bStocks token: its beacon slot does not point at the official bStocks beacon, so treat it as a look-alike.",
        }
      }),
  )

  server.registerTool(
    "position_ledger",
    {
      description:
        "Reconstruct a holder's true position in one or more bStocks tokens from Transfer history, " +
        "with acquisition lots, net units and corporate-action events (dividend/split rebases " +
        "detected as the gap between transfer-implied and live balances). Non-genuine tokens come " +
        "back zeroed with genuine=false. Scans a bounded recent block window by default; widen it " +
        "with lookbackBlocks or pin fromBlock (e.g. the token deployment block) for a full scan.",
      annotations: NETWORK_READS,
      inputSchema: {
        holder: holderArg,
        tokens: z
          .array(tokenArg)
          .min(1)
          .describe("bStock token addresses to reconstruct for this holder."),
        lookbackBlocks: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("How many blocks back from head to scan when fromBlock is not given. Default 100000."),
        fromBlock: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            "Absolute start block. Overrides lookbackBlocks; pass 0 or the token deploy block for a full history scan.",
          ),
        resolveTimestamps: z
          .boolean()
          .optional()
          .describe("Attach a unix timestamp to each transfer (extra block reads). Default false."),
      },
    },
    (args) =>
      run(async () => {
        const client = makeClient()
        const holder = toAddress(args.holder)
        const tokens = args.tokens.map(toAddress)
        const head = await client.getBlockNumber()
        const lookback = BigInt(args.lookbackBlocks ?? 100_000)
        const fromBlock =
          args.fromBlock !== undefined ? BigInt(args.fromBlock) : head > lookback ? head - lookback : 0n
        const ledgers = await ledger.buildPortfolioLedger(client, holder, tokens, {
          fromBlock,
          resolveTimestamps: args.resolveTimestamps ?? false,
        })
        return {
          holder,
          scan: {
            fromBlock,
            headBlock: head,
            note:
              args.fromBlock === undefined
                ? `Bounded recent window: last ${lookback} blocks. Corporate-action totals from before fromBlock are not counted; pass fromBlock=0 or the deploy block for a full scan.`
                : "Explicit fromBlock scan.",
          },
          ledgers,
        }
      }),
  )

  server.registerTool(
    "pre_trade_guard",
    {
      description:
        "Pre-trade gate for buying a bStock with USDT. Folds four checks into one verdict with plain " +
        "reasons: authenticity by beacon, premium-to-NAV against a reference price, depth/slippage " +
        "from the pool and US market hours. Returns allow, warn, resize or block. The premium-to-NAV " +
        "leg uses a keyless MockWeb3ApiClient reference price until the Binance Web3 API key is wired; " +
        "the authenticity, depth and market-hours legs are live BSC reads.",
      annotations: NETWORK_READS,
      inputSchema: {
        token: tokenArg,
        usdtIn: z
          .number()
          .positive()
          .describe("USDT the buyer intends to spend. Depth/slippage is estimated for exactly this size."),
      },
    },
    (args) =>
      run(async () => {
        const verdict = await guard.guardTrade({
          token: toAddress(args.token),
          usdtIn: args.usdtIn,
          api: new api.MockWeb3ApiClient(),
        })
        return {
          ...verdict,
          referencePriceSource: "mock",
          note:
            "Premium-to-NAV uses a keyless MockWeb3ApiClient reference price until the Binance Web3 API " +
            "key is wired. Authenticity, depth/slippage and market-hours checks are live BSC reads.",
        }
      }),
  )

  server.registerTool(
    "market_quote",
    {
      description:
        "Live PancakeSwap v3 market for a bStock quoted in USDT: on-chain spot price, pool depth and " +
        "reserves at one pinned block, plus the estimated slippage of a USDT buy of the given size. Also " +
        "reports whether the US regular session is open (the reference is frozen while it is closed).",
      annotations: NETWORK_READS,
      inputSchema: {
        token: tokenArg,
        usdtIn: z
          .number()
          .positive()
          .describe("USDT to spend, human units. Slippage is estimated for exactly this size."),
      },
    },
    (args) =>
      run(async () => {
        const token = toAddress(args.token)
        const state = await market.getMarket(token)
        const spotUsdtPerToken = market.spotInQuote(state)
        const buy = market.estimateUsdtBuy(state, args.usdtIn)
        return {
          token,
          usdtIn: args.usdtIn,
          spotUsdtPerToken,
          buy,
          marketHours: market.marketHours(),
          poolState: state,
        }
      }),
  )

  server.registerTool(
    "compare_providers",
    {
      description:
        "Compare the same underlying equity across the three tokenized-stock families on BSC: bStocks " +
        "(deep, tradeable), Ondo (thin) and xStocks (dust or absent). Checks each token's authenticity " +
        "live and prices it where a pool exists. States plainly that a cross-provider arb is NOT " +
        "executable on today's BSC liquidity.",
      annotations: NETWORK_READS,
      inputSchema: {
        underlying: z
          .string()
          .describe("Underlying ticker, e.g. TSLA, NVDA, AAPL, SPY. Case-insensitive."),
      },
    },
    (args) =>
      run(async () => {
        const comparison = await providers.compareProviders(args.underlying)
        return { ...comparison, knownUnderlyings: providers.KNOWN_UNDERLYINGS }
      }),
  )

  server.registerTool(
    "list_baskets",
    {
      description:
        "List the shipped thematic baskets (Conviction): id, name, thesis and target weights over " +
        "genuine bStocks. Use an id with analyze_basket. Static data, no chain read.",
      annotations: STATIC_READS,
      inputSchema: {},
    },
    () =>
      run(() =>
        basket.EXAMPLE_BASKETS.map((b) => ({
          id: b.id,
          name: b.name,
          description: b.description,
          weights: b.weights,
          tickers: Object.keys(b.weights),
        })),
      ),
  )

  server.registerTool(
    "analyze_basket",
    {
      description:
        "Price a shipped basket against a holder's wallet: read each genuine-bStock leg's balance and " +
        "USDT price, then derive portfolio value, current weights and drift versus target. A held leg " +
        "with no price marks the state incomplete rather than guessing a value.",
      annotations: NETWORK_READS,
      inputSchema: {
        id: z.string().describe("Basket id from list_baskets, e.g. mag7-ish, ai-chips, index."),
        holder: holderArg,
      },
    },
    (args) =>
      run(async () => {
        const b = basket.BASKETS_BY_ID[args.id]
        if (!b) {
          throw new Error(
            `unknown basket id "${args.id}". Known ids: ${Object.keys(basket.BASKETS_BY_ID).join(", ")}.`,
          )
        }
        return basket.analyzeBasket(b, toAddress(args.holder))
      }),
  )

  server.registerTool(
    "swipe_quote",
    {
      description:
        "Swipe: the largest safe USDT you can borrow against a bStocks position on Venus without " +
        "selling it, at a target health factor. SPOT collateralised borrowing, not a perp and not " +
        "margin. Reads the live Venus market (collateral factor, liquidation threshold, oracle price " +
        "and available USDT liquidity) and returns a health-factor-bounded, fundable borrow.",
      annotations: NETWORK_READS,
      inputSchema: {
        token: z
          .string()
          .describe(
            "The bStock collateral: a Venus market ticker key (TSLAB, NVDAB, SPCXB, SKHYB), an underlying address or a vToken address.",
          ),
        bstockAmount: z
          .number()
          .positive()
          .describe("Whole bStock tokens supplied as collateral, e.g. 3.5."),
        targetHealthFactor: z
          .number()
          .positive()
          .optional()
          .describe("Health-factor buffer to keep after borrowing. Default 2."),
        account: z
          .string()
          .optional()
          .describe("Optional account whose existing Venus USDT debt is folded into the plan."),
      },
    },
    (args) =>
      run(() =>
        lending.readSwipeQuote({
          market: args.token.trim(),
          collateralUnits: args.bstockAmount,
          targetHealthFactor: args.targetHealthFactor ?? 2,
          account: args.account?.trim(),
        }),
      ),
  )


  return server
}
