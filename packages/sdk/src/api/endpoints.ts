// Binance Web3 API endpoint map and request-signing recipe for Steward.
//
// VERIFIED 2026-09-24 against the live API with a real key (docs read post the human's cold
// first-contact, so the once-only time-to-first-call metric is untouched). Doc:
// https://web3.binance.com/en/dev-docs/authentication . Every path and signing detail below
// was confirmed by a live authenticated call; see .hq/api-verification.json for the measured
// shapes, latencies and verbatim errors. The HttpWeb3ApiClient in client.ts uses these.
import { BSC_CHAIN_ID } from "../chain/constants.js"

// VERIFIED. Every endpoint is served from this host under a fixed /build base path. The path
// passed to a request is joined onto this and the same path (with the /build prefix plus the raw
// query string) is what gets signed. Guessed https://api.binance.com, real is web3.binance.com/build.
export const WEB3_API_BASE_URL = "https://web3.binance.com/build"

// VERIFIED. The signed requestPath must carry this prefix. Omitting it is the documented number-one
// cause of 40102 Invalid signature.
export const SIGNED_PATH_PREFIX = "/build"

// VERIFIED. The chain is passed as `binanceChainId`. Guessed name matched, but the VALUE is a STRING
// ("56" BSC, "1" Ethereum, "CT_501" Solana, "CT_195" Tron), not a number as the old types assumed.
export const BINANCE_CHAIN_ID_PARAM = "binanceChainId"
export const DEFAULT_BINANCE_CHAIN_ID = String(BSC_CHAIN_ID) // "56"

// Logical endpoint paths, grouped by the Web3 API module Steward exercises. VERIFIED live: the real
// prefix is /api/v1/dex/... (the guessed /v1/web3/... paths were all wrong). RWA data lives under the
// Market module, there is no dedicated corporate-actions route (derive from underlying-market).
export const ENDPOINTS = {
  rwa: {
    // GET, param `tokenContractAddresses` (PLURAL, comma-separated up to a batch). VERIFIED.
    referencePrice: "/api/v1/dex/market/rwa/price",
    // GET, params `binanceChainId` + `tokenContractAddress` (SINGULAR). Carries statusInfo (hours)
    // and marketData (incl. dividendYield / latestDividend). VERIFIED.
    underlyingMarket: "/api/v1/dex/market/rwa/underlying-market",
    // GET, company info for an RWA token. VERIFIED.
    underlyingProfile: "/api/v1/dex/market/rwa/underlying-profile",
    // GET, the RWA token roster with embedded price + status + ratio. VERIFIED.
    tokens: "/api/v1/dex/market/rwa/tokens",
    // GET, search RWA tokens by keyword or address. Doc-listed, not probed.
    search: "/api/v1/dex/market/rwa/search",
  },
  market: {
    // POST batch, body is an array of {binanceChainId, tokenContractAddress}, up to 100. VERIFIED.
    price: "/api/v1/dex/market/price",
    // GET candlestick data. Doc-listed, not probed this pass.
    candles: "/api/v1/dex/market/candles",
    // GET, the supported-chain whitelist. VERIFIED (confirms binanceChainId is a string).
    supportedChain: "/api/v1/dex/market/supported/chain",
  },
  trading: {
    // GET aggregated quote. Returns an array of priced routes sorted by toTokenAmount desc, each with
    // its own quoteId (TTL ~30s). VERIFIED.
    quote: "/api/v1/dex/aggregator/quote",
    // GET, build the swap tx for a chosen quoteId. Doc-listed, not called (no spend this pass).
    buildSwap: "/api/v1/dex/aggregator/swap",
    // GET, quote + build in one call (Flash API). Doc-listed.
    quoteAndSwap: "/api/v1/dex/aggregator/quote-and-swap",
  },
  transaction: {
    // POST, off-chain simulation. Body {binanceChainId, evmTx:{from,to,data,value}}. VERIFIED.
    simulate: "/api/v1/dex/pre-transaction/simulate",
  },
  wallet: {
    // GET all balances for an address (paginated). VERIFIED (empty on base tier for funded addresses).
    balances: "/api/v1/dex/balance/all-token-balances-by-address",
  },
  b402: {
    // The real b402 module is an x402 facilitator: /verify and /settle act on a client-built payment,
    // /supported lists networks + assets + schemes. There is no "payment-requirements" GET: an x402
    // requirement is defined by the payee (Steward), not fetched from Binance. Doc-listed, not called
    // (calling /settle would move funds). See client.ts getPaymentRequirements.
    supported: "/api/v1/b402/supported",
    verify: "/api/v1/b402/verify",
    settle: "/api/v1/b402/settle",
  },
} as const

// Request signing. VERIFIED live. HMAC-SHA256 over timestamp + METHOD + requestPath + body, then
// Base64. Header names are X-OC-* (the guessed X-MBX / X-WEB3 names were wrong).
export const SIGNING = {
  algorithm: "HMAC-SHA256",
  messageOrder: ["timestamp", "method", "requestPath", "body"] as const,
  signedRequestPathPrefix: SIGNED_PATH_PREFIX,
  timestampFormat: "ISO 8601 with milliseconds (new Date().toISOString())",
  headers: {
    apiKey: "X-OC-APIKEY",
    signature: "X-OC-SIGN",
    timestamp: "X-OC-TIMESTAMP",
    recvWindow: "X-OC-RECV-WINDOW", // optional, default 5000ms, max 60000ms
    nonce: "X-OC-NONCE", // optional anti-replay id
  },
} as const

// VERIFIED error behaviour. Gateway auth/signature/timestamp/permission/rate-limit errors return the
// REAL HTTP status (401 for 40101/40102/40103, 403 for 40104, 429 for 42900). Business/validation
// errors reach the service and return HTTP 200 with a non-zero body `code` (e.g. 40001, 40411). The
// old ERRORS_RETURN_HTTP_200 guess was only half right, so a correct client checks BOTH the HTTP
// status and the body `code`.
export const SUCCESS_CODE = 0
export const ERROR_CODES = {
  PARAM: 40001,
  API_KEY: 40101,
  SIGNATURE: 40102,
  TIMESTAMP: 40103,
  PERMISSION: 40104,
  CHAIN_NOT_SUPPORTED: 40411,
  RATE_LIMIT: 42900,
  INTERNAL: 50000,
  UNAVAILABLE: 50001,
} as const

// Build the raw URL-encoded query string exactly as it must appear on the wire and in the signature:
// encodeURIComponent on each key and value (so spaces become %20, not +), joined with &, no
// reordering, blanks dropped. Returns "" for an empty param set.
export function buildQueryString(params?: Record<string, string | number | undefined | null>): string {
  if (!params) return ""
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.join("&")
}

// Assemble the canonical pre-hash string a signed request signs over. Pure string work, no crypto and
// no network. Pass the /build-prefixed requestPath (use toSignedRequestPath).
export function canonicalSigningString(input: {
  timestamp: number | string
  method: string
  requestPath: string
  body?: string
}): string {
  const { timestamp, method, requestPath, body = "" } = input
  return `${timestamp}${method.toUpperCase()}${requestPath}${body}`
}

// Prefix a bare path (/api/v1/...) with /build for signing and for the wire. Idempotent.
export function toSignedRequestPath(pathWithQuery: string): string {
  return pathWithQuery.startsWith(SIGNED_PATH_PREFIX)
    ? pathWithQuery
    : `${SIGNED_PATH_PREFIX}${pathWithQuery}`
}
