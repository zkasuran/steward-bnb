// Web3ApiClient: the interface Steward's modules depend on, plus a keyless mock that lets the
// whole suite run/test/demo with no API key, plus an HTTP skeleton that REFUSES to call Binance
// until the human wires a key in the instrumented dev-portal session.
//
// The HTTP skeleton throws rather than fetching on purpose: the DevEx report scores the human's
// cold time-to-first-authenticated-call (25%, once-only), so no agent-side call may beat the
// human to it. Every path and field it references is UNVERIFIED (see endpoints.ts, types.ts).
import { getAddress, type Address } from "viem"
import { BSTOCKS_CANDIDATES, USDT } from "../chain/constants.js"
import { ENDPOINTS, WEB3_API_BASE_URL } from "./endpoints.js"
import type {
  BalancesRequest,
  BalancesResponse,
  CandlesRequest,
  CandlesResponse,
  CorporateActionsRequest,
  CorporateActionsResponse,
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
  SimulateRequest,
  SimulateResponse,
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
}

// The real client, SKELETON only. Every method is written against the documented shapes, but
// each one REFUSES rather than fetching, so nothing can call Binance before the human's clocked
// first-contact session. Wiring a method means adding the fetch plus the HMAC signing recipe in
// endpoints.ts and confirming the endpoint there.
export class HttpWeb3ApiClient implements Web3ApiClient {
  private readonly config: HttpClientConfig

  constructor(config: HttpClientConfig) {
    this.config = config
  }

  getReferencePrice(_req: ReferencePriceRequest): Promise<ReferencePriceResponse> {
    return this.notWired(this.url(ENDPOINTS.rwa.referencePrice))
  }
  getCorporateActions(_req: CorporateActionsRequest): Promise<CorporateActionsResponse> {
    return this.notWired(this.url(ENDPOINTS.rwa.corporateActions))
  }
  getMarketStatus(_req: MarketStatusRequest): Promise<MarketStatusResponse> {
    return this.notWired(this.url(ENDPOINTS.rwa.marketStatus))
  }
  getPrice(_req: PriceRequest): Promise<PriceResponse> {
    return this.notWired(this.url(ENDPOINTS.market.price))
  }
  getCandles(_req: CandlesRequest): Promise<CandlesResponse> {
    return this.notWired(this.url(ENDPOINTS.market.candles))
  }
  getQuote(_req: QuoteRequest): Promise<QuoteResponse> {
    return this.notWired(this.url(ENDPOINTS.trading.quote))
  }
  simulateTransaction(_req: SimulateRequest): Promise<SimulateResponse> {
    return this.notWired(this.url(ENDPOINTS.transaction.simulate))
  }
  getBalances(_req: BalancesRequest): Promise<BalancesResponse> {
    return this.notWired(this.url(ENDPOINTS.wallet.balances))
  }
  getPaymentRequirements(_req: PaymentRequirementsRequest): Promise<PaymentRequirementsResponse> {
    return this.notWired(this.url(ENDPOINTS.b402.paymentRequirements))
  }

  private url(path: string): string {
    return `${this.config.baseUrl ?? WEB3_API_BASE_URL}${path}`
  }

  // Refuse rather than call. The `_url` is the endpoint the wired method will hit.
  private notWired(_url: string): never {
    throw new Error("web3 api not wired: confirm endpoints in the clocked dev-portal session")
  }
}

