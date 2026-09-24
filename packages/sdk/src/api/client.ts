// Web3ApiClient: the interface Steward's modules depend on, plus a keyless mock that lets the whole
// suite run/test/demo with no API key, plus a REAL HTTP client wired to the live Binance Web3 API.
//
// VERIFIED 2026-09-24: HttpWeb3ApiClient signs and calls the live gateway and maps the real
// on-the-wire shapes onto Steward's stable response types. The signing recipe, the real endpoint
// paths and the measured field mapping live in endpoints.ts, types.ts and .hq/api-verification.json.
// Docs were read after the human's cold first-contact, so the once-only time-to-first-call metric
// is untouched. Use createWeb3ApiClient() to get Http when a key is present, Mock otherwise.
import { getAddress, type Address } from "viem"
import { BSTOCKS_CANDIDATES, USDT } from "../chain/constants.js"
import {
  buildQueryString,
  canonicalSigningString,
  DEFAULT_BINANCE_CHAIN_ID,
  ENDPOINTS,
  SIGNING,
  SUCCESS_CODE,
  toSignedRequestPath,
  WEB3_API_BASE_URL,
} from "./endpoints.js"
import type {
  AggregatorQuoteRouteRaw,
  AllowanceChange,
  ApiEnvelope,
  BalanceChange,
  BalancesRequest,
  BalancesResponse,
  Candle,
  CandlesRequest,
  CandlesResponse,
  CorporateAction,
  CorporateActionsRequest,
  CorporateActionsResponse,
  MarketPriceRowRaw,
  MarketStatusRequest,
  MarketStatusResponse,
  PaymentRequirementsRequest,
  PaymentRequirementsResponse,
  PriceRequest,
  PriceResponse,
  QuoteRequest,
  QuoteResponse,
  ReferencePriceRequest,
  ReferencePriceResponse,
  RwaPriceRowRaw,
  RwaUnderlyingMarketRaw,
  SimulateRequest,
  SimulateResponse,
  SimulateResultRaw,
  WalletBalance,
  WalletBalancePageRaw,
} from "./types.js"

// The contract every Steward module codes against. One import, two implementations.
export interface Web3ApiClient {
  // RWA Data
  getReferencePrice(req: ReferencePriceRequest): Promise<ReferencePriceResponse>
  getCorporateActions(req: CorporateActionsRequest): Promise<CorporateActionsResponse>
  getMarketStatus(req: MarketStatusRequest): Promise<MarketStatusResponse>
  // Market
  getPrice(req: PriceRequest): Promise<PriceResponse>
  getCandles(req: CandlesRequest): Promise<CandlesResponse>
  // Trading
  getQuote(req: QuoteRequest): Promise<QuoteResponse>
  // Transaction
  simulateTransaction(req: SimulateRequest): Promise<SimulateResponse>
  // Wallet
  getBalances(req: BalancesRequest): Promise<BalancesResponse>
  // b402 Payments
  getPaymentRequirements(req: PaymentRequirementsRequest): Promise<PaymentRequirementsResponse>
}

// zkasuran's public EOA, used as the demo payTo for the b402 income-rail fixture. Public
// address only, never the key.
const HOUSE_WALLET: Address = getAddress("0xdb6c6340342e71a63cd11ebac2185204b7777777")
const AAPLB: Address = BSTOCKS_CANDIDATES.AAPLB

// Keyless mock with realistic, self-consistent in-memory fixtures. It lets the suite run,
// test and demo with no Binance key. Reference price sits near the on-chain price so
// tokenPrice / (referencePrice * ratio) is about 1, the market is shown closed for the
// weekend, plus a sample dividend corporate action and a sample b402 requirement.
export class MockWeb3ApiClient implements Web3ApiClient {
  async getReferencePrice(req: ReferencePriceRequest): Promise<ReferencePriceResponse> {
    return {
      symbol: req.symbol,
      referencePrice: "227.50",
      tokenToShareRatio: "1",
      asOf: Date.now(),
      source: "mock-fixture",
    }
  }

  async getCorporateActions(req: CorporateActionsRequest): Promise<CorporateActionsResponse> {
    const symbol = req.symbol ?? "AAPLB"
    return {
      actions: [
        {
          type: "dividend",
          symbol,
          token: AAPLB,
          exDate: Date.parse("2026-08-08T00:00:00Z"),
          payDate: Date.parse("2026-08-15T00:00:00Z"),
          cashPerShare: "0.25",
          currency: "USD",
          note: "Quarterly cash dividend, surfaced as a silent rebase on the bStocks balance.",
        },
      ],
    }
  }

  async getMarketStatus(req: MarketStatusRequest): Promise<MarketStatusResponse> {
    return {
      market: req.market ?? "US_EQUITY",
      isOpen: false,
      state: "closed",
      nextOpen: Date.parse("2026-09-28T13:30:00Z"),
      asOf: Date.now(),
      note: "US equities closed for the weekend. On-chain price is stale versus the reference.",
    }
  }

  async getPrice(req: PriceRequest): Promise<PriceResponse> {
    return { symbol: req.symbol, price: "227.58", asOf: Date.now() }
  }

  async getCandles(req: CandlesRequest): Promise<CandlesResponse> {
    return {
      symbol: req.symbol,
      bar: req.bar,
      candles: [["227.10", "228.40", "226.90", "227.58", "1543.20", Date.parse("2026-09-19T20:00:00Z")]],
    }
  }

  async getQuote(req: QuoteRequest): Promise<QuoteResponse> {
    const provider = req.provider ?? "bstock"
    return {
      symbol: req.symbol,
      side: req.side,
      provider,
      tokenPrice: "227.58",
      referencePrice: "227.50",
      tokenToShareRatio: "1",
      inAmount: req.amount,
      outAmount: req.side === "buy" ? "0.4394" : "100.00",
      requestPath: "/build" + ENDPOINTS.trading.quote,
      expiresAt: Date.now() + 30_000,
    }
  }

  async simulateTransaction(req: SimulateRequest): Promise<SimulateResponse> {
    return {
      success: true,
      balanceChanges: [
        { token: USDT, symbol: "USDT", decimals: 18, before: "1000.00", after: "900.00", delta: "-100.00" },
        { token: AAPLB, symbol: "AAPLB", decimals: 18, before: "0", after: "0.4394", delta: "+0.4394" },
      ],
      allowanceChanges: [{ token: USDT, spender: req.to, before: "0", after: "100.00", delta: "+100.00" }],
      gasUsed: "184213",
    }
  }

  async getBalances(req: BalancesRequest): Promise<BalancesResponse> {
    return {
      address: req.address,
      balances: [
        { token: AAPLB, symbol: "AAPLB", decimals: 18, balance: "0.4394" },
        { token: USDT, symbol: "USDT", decimals: 18, balance: "900.00" },
      ],
    }
  }

  async getPaymentRequirements(req: PaymentRequirementsRequest): Promise<PaymentRequirementsResponse> {
    return {
      accepts: [
        {
          scheme: "exact",
          network: "bsc",
          asset: USDT,
          amount: "250000000000000000",
          payTo: HOUSE_WALLET,
          maxTimeoutSeconds: 300,
          decimals: 18,
          extra: { resource: req.resource ?? "/paycheck/dividend", description: "Dividend income routed via b402." },
        },
      ],
    }
  }
}

export interface HttpClientConfig {
  apiKey: string
  apiSecret: string
  baseUrl?: string
  binanceChainId?: string // default "56"
  recvWindowMs?: number // optional, sets X-OC-RECV-WINDOW
}

// Thrown when the gateway or a business rule rejects a call. Carries the body `code` and the real
// HTTP status, since gateway auth errors come back HTTP 401/403/429 while business errors are 200.
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code: number,
    readonly endpoint: string,
    readonly apiMsg?: string,
  ) {
    super(message)
    this.name = "ApiRequestError"
  }
}

// The real client. Signs each request per the VERIFIED recipe (X-OC-* headers, HMAC-SHA256 over
// timestamp + METHOD + /build-path + body, Base64), calls the live gateway, parses the OCResult
// envelope and maps the real shapes onto Steward's response types. It never logs the secret and it
// is read-only for Steward's use: quotes and simulations do not broadcast anything.
export class HttpWeb3ApiClient implements Web3ApiClient {
  private readonly config: Required<Omit<HttpClientConfig, "recvWindowMs">> & { recvWindowMs?: number }

  constructor(config: HttpClientConfig) {
    this.config = { baseUrl: WEB3_API_BASE_URL, binanceChainId: DEFAULT_BINANCE_CHAIN_ID, ...config }
  }

  // Core: sign, fetch, parse the envelope, surface errors. Body is "" for GET.
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    opts?: { query?: Record<string, string | number | undefined>; body?: unknown },
  ): Promise<T> {
    const qs = buildQueryString(opts?.query)
    const pathWithQuery = qs ? `${path}?${qs}` : path
    const bodyStr = opts?.body !== undefined ? JSON.stringify(opts.body) : ""
    const timestamp = new Date().toISOString()
    const requestPath = toSignedRequestPath(pathWithQuery)
    const preHash = canonicalSigningString({ timestamp, method, requestPath, body: bodyStr })
    const signature = await hmacSha256Base64(this.config.apiSecret, preHash)
    const headers: Record<string, string> = {
      [SIGNING.headers.apiKey]: this.config.apiKey,
      [SIGNING.headers.timestamp]: timestamp,
      [SIGNING.headers.signature]: signature,
    }
    if (this.config.recvWindowMs) headers[SIGNING.headers.recvWindow] = String(this.config.recvWindowMs)
    if (bodyStr) headers["Content-Type"] = "application/json"
    const resp = await fetch(this.config.baseUrl + pathWithQuery, { method, headers, body: bodyStr || undefined })
    const text = await resp.text()
    let env: ApiEnvelope<T> | null = null
    try {
      env = text ? (JSON.parse(text) as ApiEnvelope<T>) : null
    } catch {
      env = null
    }
    if (!env) throw new ApiRequestError(`${path}: non-JSON response`, resp.status, -1, path)
    if (env.code !== SUCCESS_CODE) {
      throw new ApiRequestError(`${path}: [${env.code}] ${env.msg ?? "error"}`, resp.status, env.code, path, env.msg)
    }
    return (env.data ?? null) as T
  }
  // RWA reference price -> GET /api/v1/dex/market/rwa/price (tokenContractAddresses is plural).
  async getReferencePrice(req: ReferencePriceRequest): Promise<ReferencePriceResponse> {
    const chain = req.binanceChainId ?? this.config.binanceChainId
    const addr = this.resolveToken(req.symbol, req.tokenContractAddress)
    const rows = await this.request<RwaPriceRowRaw[]>("GET", ENDPOINTS.rwa.referencePrice, {
      query: { binanceChainId: chain, tokenContractAddresses: addr },
    })
    const row = rows?.[0]
    if (!row) throw new ApiRequestError(`rwa/price: no data for ${req.symbol}`, 200, -1, ENDPOINTS.rwa.referencePrice)
    const refNum = Number(row.referencePrice)
    // API invariant: tokenPrice == referencePrice * tokenToShareRatio, so derive the ratio here.
    const ratio = refNum > 0 ? String(Number(row.tokenPrice) / refNum) : "1"
    return {
      symbol: req.symbol,
      referencePrice: row.referencePrice,
      tokenToShareRatio: ratio,
      tokenPrice: row.tokenPrice,
      asOf: row.tokenPriceUpdatedAt,
      source: `binance-web3:${row.platformId}`,
    }
  }

  // No corporate-actions endpoint exists. Derive a dividend from underlying-market; splits and
  // rebases are detected on-chain by the ledger module.
  async getCorporateActions(req: CorporateActionsRequest): Promise<CorporateActionsResponse> {
    const chain = req.binanceChainId ?? this.config.binanceChainId
    const symbol = req.symbol ?? ""
    const addr = this.resolveToken(symbol, req.tokenContractAddress ?? req.token)
    const d = await this.request<RwaUnderlyingMarketRaw>("GET", ENDPOINTS.rwa.underlyingMarket, {
      query: { binanceChainId: chain, tokenContractAddress: addr },
    })
    const actions: CorporateAction[] = []
    const latest = d.marketData?.latestDividend
    if (latest && Number(latest) > 0) {
      actions.push({
        type: "dividend",
        symbol: symbol || d.tokenContractAddress,
        token: getAddress(d.tokenContractAddress),
        cashPerShare: latest,
        currency: "USD",
        note: `Derived from rwa/underlying-market latestDividend (yield ${d.marketData?.dividendYield ?? "n/a"}). No dedicated feed.`,
      })
    }
    return { actions }
  }
  // Market hours / open state -> GET /api/v1/dex/market/rwa/underlying-market.
  async getMarketStatus(req: MarketStatusRequest): Promise<MarketStatusResponse> {
    const chain = req.binanceChainId ?? this.config.binanceChainId
    const addr = this.resolveToken(req.symbol ?? "", req.tokenContractAddress)
    const d = await this.request<RwaUnderlyingMarketRaw>("GET", ENDPOINTS.rwa.underlyingMarket, {
      query: { binanceChainId: chain, tokenContractAddress: addr },
    })
    const s = d.statusInfo
    return {
      market: req.market ?? "US_EQUITY",
      isOpen: Boolean(s.openState),
      state: s.marketStatus ?? (s.openState ? "open" : "closed"),
      nextOpen: s.nextOpenTime ?? undefined,
      nextClose: s.nextCloseTime ?? undefined,
      asOf: Date.now(),
      note: s.reasonCode ?? undefined,
      dividendYield: d.marketData?.dividendYield ?? undefined,
      latestDividend: d.marketData?.latestDividend ?? undefined,
    }
  }

  // Latest on-chain token price -> POST /api/v1/dex/market/price (batch body).
  async getPrice(req: PriceRequest): Promise<PriceResponse> {
    const chain = req.binanceChainId ?? this.config.binanceChainId
    const addr = this.resolveToken(req.symbol, req.tokenContractAddress)
    const rows = await this.request<MarketPriceRowRaw[]>("POST", ENDPOINTS.market.price, {
      body: [{ binanceChainId: chain, tokenContractAddress: addr }],
    })
    const row = rows?.[0]
    if (!row) throw new ApiRequestError(`market/price: no data for ${req.symbol}`, 200, -1, ENDPOINTS.market.price)
    return { symbol: req.symbol, price: row.price, asOf: row.time }
  }

  // Candles -> GET /api/v1/dex/market/candles. Doc-listed; row shape not live-verified this pass, so
  // the positional map is best-effort (open, high, low, close, volume, timestamp).
  async getCandles(req: CandlesRequest): Promise<CandlesResponse> {
    const chain = req.binanceChainId ?? this.config.binanceChainId
    const addr = this.resolveToken(req.symbol, req.tokenContractAddress)
    const rows = await this.request<unknown[]>("GET", ENDPOINTS.market.candles, {
      query: { binanceChainId: chain, tokenContractAddress: addr, bar: req.bar, limit: req.limit },
    })
    const candles: Candle[] = (rows ?? []).map((r) => {
      const a = r as unknown[]
      return [String(a[0]), String(a[1]), String(a[2]), String(a[3]), String(a[4]), Number(a[5])] as Candle
    })
    return { symbol: req.symbol, bar: req.bar, candles }
  }
  // Aggregated DEX quote -> GET /api/v1/dex/aggregator/quote. Returns an array of routes; pick the
  // best. Buy = USDT -> stock token, sell = stock token -> USDT. Nothing is broadcast.
  async getQuote(req: QuoteRequest): Promise<QuoteResponse> {
    const chain = req.binanceChainId ?? this.config.binanceChainId
    const stock = this.resolveToken(req.symbol, req.side === "buy" ? req.toTokenAddress : req.fromTokenAddress)
    const fromToken = req.fromTokenAddress ?? (req.side === "buy" ? USDT : stock)
    const toToken = req.toTokenAddress ?? (req.side === "buy" ? stock : USDT)
    const routes = await this.request<AggregatorQuoteRouteRaw[]>("GET", ENDPOINTS.trading.quote, {
      query: {
        binanceChainId: chain,
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        amount: req.amount,
        userWalletAddress: req.userWalletAddress ?? HOUSE_WALLET,
      },
    })
    const route = routes?.find((r) => r.isBest) ?? routes?.[0]
    if (!route) throw new ApiRequestError(`aggregator/quote: no route for ${req.symbol}`, 200, -1, ENDPOINTS.trading.quote)
    const unit = req.side === "buy" ? route.toToken.tokenUnitPrice : route.fromToken.tokenUnitPrice
    return {
      symbol: req.symbol,
      side: req.side,
      provider: route.vendorName ?? req.provider ?? "bstock",
      tokenPrice: unit,
      inAmount: route.fromTokenAmount,
      outAmount: route.toTokenAmount,
      quoteId: route.quoteId,
      executionMode: route.executionMode,
      vendorName: route.vendorName,
      priceImpactPercent: route.priceImpactPercent,
      requestPath: toSignedRequestPath(ENDPOINTS.trading.quote),
      expiresAt: Date.now() + 30_000,
    }
  }
  // Off-chain simulation -> POST /api/v1/dex/pre-transaction/simulate. Read-only, broadcasts nothing.
  async simulateTransaction(req: SimulateRequest): Promise<SimulateResponse> {
    const chain = req.binanceChainId ?? this.config.binanceChainId
    const d = await this.request<SimulateResultRaw>("POST", ENDPOINTS.transaction.simulate, {
      body: { binanceChainId: chain, evmTx: { from: req.from, to: req.to, data: req.data, value: req.value ?? "0" } },
    })
    return {
      success: d.status === "SUCCESS",
      status: d.status,
      failReason: d.failReason,
      balanceChanges: (d.balanceChanges ?? []) as unknown as BalanceChange[],
      allowanceChanges: (d.allowanceChanges ?? []) as unknown as AllowanceChange[],
    }
  }

  // All token balances -> GET .../all-token-balances-by-address (paginated). Element shape is not
  // live-confirmed on the base tier, so field names are read defensively.
  async getBalances(req: BalancesRequest): Promise<BalancesResponse> {
    const chain = req.binanceChainId ?? this.config.binanceChainId
    const pages = await this.request<WalletBalancePageRaw[]>("GET", ENDPOINTS.wallet.balances, {
      query: { binanceChainId: chain, address: req.address },
    })
    const assets = (pages ?? []).flatMap((p) => p.tokenAssets ?? [])
    const balances: WalletBalance[] = assets.map((a) => {
      const o = a as Record<string, unknown>
      const token = String(o.tokenContractAddress ?? o.contractAddress ?? o.address ?? "")
      return {
        token: getAddress(token || "0x0000000000000000000000000000000000000000"),
        symbol: (o.symbol ?? o.tokenSymbol) as string | undefined,
        decimals: o.decimals != null ? Number(o.decimals) : undefined,
        balance: String(o.balance ?? o.amount ?? o.tokenAmount ?? "0"),
      }
    })
    return { address: req.address, balances }
  }
  // b402 payment requirement. This is a PAYEE-side x402 construct, not a Binance GET, so it is built
  // locally (as the mock does). The real b402 facilitator (/verify, /settle, /supported) acts on a
  // client-built payment; /settle moves funds and is never called here.
  async getPaymentRequirements(req: PaymentRequirementsRequest): Promise<PaymentRequirementsResponse> {
    return {
      accepts: [
        {
          scheme: "exact",
          network: "bsc",
          asset: USDT,
          amount: "250000000000000000",
          payTo: HOUSE_WALLET,
          maxTimeoutSeconds: 300,
          decimals: 18,
          extra: {
            resource: req.resource ?? "/paycheck/dividend",
            description: "Dividend income routed via b402.",
            source: "payee-side x402 requirement (not a Binance endpoint)",
          },
        },
      ],
    }
  }

  private resolveToken(symbol: string, explicit?: Address): string {
    if (explicit) return explicit.toLowerCase()
    const map = BSTOCKS_CANDIDATES as Record<string, Address | undefined>
    const addr = map[symbol] ?? map[`${symbol}_disputed`]
    if (!addr) {
      throw new ApiRequestError(`cannot resolve symbol "${symbol}"; pass tokenContractAddress`, 0, -1, "resolveToken")
    }
    return addr.toLowerCase()
  }
}

// Factory: return the real HTTP client when credentials are present (from config or env), else the
// keyless mock so the whole suite still runs. Env names: BINANCE_WEB3_API_KEY / BINANCE_WEB3_API_SECRET
// (this workspace) or OC_API_KEY / OC_SECRET_KEY (the Binance docs convention).
export function createWeb3ApiClient(config?: Partial<HttpClientConfig>): Web3ApiClient {
  const apiKey = config?.apiKey ?? readEnv("BINANCE_WEB3_API_KEY", "OC_API_KEY")
  const apiSecret = config?.apiSecret ?? readEnv("BINANCE_WEB3_API_SECRET", "OC_SECRET_KEY")
  if (apiKey && apiSecret) return new HttpWeb3ApiClient({ ...config, apiKey, apiSecret })
  return new MockWeb3ApiClient()
}

function readEnv(...names: string[]): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined
  for (const n of names) {
    const v = process.env[n]
    if (v) return v
  }
  return undefined
}

// HMAC-SHA256 -> Base64 via Web Crypto, so this module needs no node:crypto import and stays portable
// across Node, edge and browser bundles. The Http client only runs server-side, where the secret lives.
async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message))
  return toBase64(new Uint8Array(sig))
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64")
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

