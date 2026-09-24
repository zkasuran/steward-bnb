// Reference-price client wiring for the Steward dashboard server routes.
//
// createReferenceClient() returns the live HttpWeb3ApiClient when BINANCE_WEB3_API_KEY /
// BINANCE_WEB3_API_SECRET are set in the environment (the SDK factory reads env; routes never touch
// the raw credentials). Otherwise it returns the keyless MockWeb3ApiClient, plus the mode so the UI
// can label the reference honestly. The client is wrapped by ReconcilingWeb3ApiClient, which maps
// the ticker the dashboard shows to the RWA feed's own contract address before every RWA call,
// because the feed keys by address and its bStock set is not our on-chain candidate set.
import { getAddress, type Address } from "viem"
import { api } from "@steward/sdk"
import { resolveRwaFeed } from "./rwa-feed"

export type ReferenceMode = "live" | "mock"

// Thrown when the RWA feed simply does not list a ticker (e.g. AAPLB has no bStock listing). The
// guard catches it into a skipped-check warning; the holdings route marks the reference unavailable.
// Either way the price is NOT fabricated.
export class ReferenceUnavailableError extends Error {
  readonly code = "RWA_NOT_COVERED"
  constructor(label: string) {
    super(`${label} is not listed in the Binance RWA bStock feed, so no reference price is available`)
    this.name = "ReferenceUnavailableError"
  }
}

// Wraps a Web3ApiClient so the three RWA-address calls (reference price, market status, corporate
// actions) resolve the shown ticker to the feed's own contract address before they go out. They
// throw a clean ReferenceUnavailableError when the feed does not list it. Every other method passes
// straight through unchanged. Reconciling the on-chain-vs-feed address mismatch here keeps it out of
// the route handlers and out of the SDK.
export class ReconcilingWeb3ApiClient implements api.Web3ApiClient {
  constructor(private readonly delegate: api.Web3ApiClient) {}

  private feedAddress(symbol?: string, tokenContractAddress?: Address): Address {
    const entry = resolveRwaFeed({ address: tokenContractAddress, symbol })
    if (!entry) throw new ReferenceUnavailableError(symbol ?? tokenContractAddress ?? "token")
    return getAddress(entry.address)
  }

  getReferencePrice(req: api.ReferencePriceRequest): Promise<api.ReferencePriceResponse> {
    return this.delegate.getReferencePrice({ ...req, tokenContractAddress: this.feedAddress(req.symbol, req.tokenContractAddress) })
  }

  getMarketStatus(req: api.MarketStatusRequest): Promise<api.MarketStatusResponse> {
    return this.delegate.getMarketStatus({ ...req, tokenContractAddress: this.feedAddress(req.symbol, req.tokenContractAddress) })
  }

  getCorporateActions(req: api.CorporateActionsRequest): Promise<api.CorporateActionsResponse> {
    return this.delegate.getCorporateActions({
      ...req,
      tokenContractAddress: this.feedAddress(req.symbol, req.tokenContractAddress ?? req.token),
    })
  }

  getPrice(req: api.PriceRequest): Promise<api.PriceResponse> {
    return this.delegate.getPrice(req)
  }
  getCandles(req: api.CandlesRequest): Promise<api.CandlesResponse> {
    return this.delegate.getCandles(req)
  }
  getQuote(req: api.QuoteRequest): Promise<api.QuoteResponse> {
    return this.delegate.getQuote(req)
  }
  simulateTransaction(req: api.SimulateRequest): Promise<api.SimulateResponse> {
    return this.delegate.simulateTransaction(req)
  }
  getBalances(req: api.BalancesRequest): Promise<api.BalancesResponse> {
    return this.delegate.getBalances(req)
  }
  getPaymentRequirements(req: api.PaymentRequirementsRequest): Promise<api.PaymentRequirementsResponse> {
    return this.delegate.getPaymentRequirements(req)
  }
}

// Build the reference client and report whether the live key is present. mode "live" wraps the real
// HttpWeb3ApiClient in the reconciler so RWA calls hit the feed's own address and uncovered tickers
// degrade honestly. mode "mock" returns the keyless fixture untouched, so with no key the dashboard
// stays on the labelled mock exactly as before.
export function createReferenceClient(): { client: api.Web3ApiClient; mode: ReferenceMode } {
  const delegate = api.createWeb3ApiClient()
  if (delegate instanceof api.HttpWeb3ApiClient) {
    return { client: new ReconcilingWeb3ApiClient(delegate), mode: "live" }
  }
  return { client: delegate, mode: "mock" }
}
