// Binance Web3 API endpoint map and request-signing recipe for Steward.
//
// EVERY path, field name and signing detail below is UNVERIFIED. It is reconstructed from
// the roost rival README hints recorded in .hq/MEMORY.md, never from a Binance doc page,
// because this lane's DevEx score (25%, once-only) measures the human's cold
// time-to-first-authenticated-call. Nothing in this file calls Binance. The human confirms
// each value in the instrumented dev-portal session and clears its `// VERIFY` marker there.
import { BSC_CHAIN_ID } from "../chain/constants.js"

// Base host. roost's README did not pin the API host, so this is a placeholder to confirm in
// the clocked session, not a fact.
export const WEB3_API_BASE_URL = "https://api.binance.com" // VERIFY in clocked session

// The chain is passed as `binanceChainId`, NOT `chainId` (roost hint). BSC is 56.
export const BINANCE_CHAIN_ID_PARAM = "binanceChainId" // VERIFY in clocked session
export const DEFAULT_BINANCE_CHAIN_ID = BSC_CHAIN_ID // 56, from chain/constants

// Logical endpoint paths, grouped by the Web3 API module Steward exercises. roost pinned only
// the `/build` requestPath prefix on signed trading calls, not the full routes, so every path
// here is an inferred placeholder to confirm.
export const ENDPOINTS = {
  rwa: {
    referencePrice: "/v1/web3/rwa/reference-price", // VERIFY in clocked session
    corporateActions: "/v1/web3/rwa/corporate-actions", // VERIFY in clocked session
    marketStatus: "/v1/web3/rwa/market-status", // VERIFY in clocked session
  },
  market: {
    price: "/v1/web3/market/price", // VERIFY in clocked session
    candles: "/v1/web3/market/klines", // VERIFY in clocked session
  },
  trading: {
    // Signed. The requestPath used in the HMAC carries a `/build` prefix (roost hint).
    quote: "/v1/web3/trade/quote", // VERIFY in clocked session
    buildSwap: "/build/v1/web3/trade/swap", // VERIFY in clocked session
  },
  transaction: {
    simulate: "/v1/web3/transaction/simulate", // VERIFY in clocked session
  },
  wallet: {
    balances: "/v1/web3/wallet/balances", // VERIFY in clocked session
  },
  b402: {
    paymentRequirements: "/v1/web3/b402/payment-requirements", // VERIFY in clocked session
  },
} as const

// Request signing. roost hint: HMAC over the concatenation of
// timestamp + method + requestPath + body. Signed trading calls prefix the requestPath with
// `/build`. Header names below are placeholders to confirm.
export const SIGNING = {
  algorithm: "HMAC-SHA256", // VERIFY in clocked session
  messageOrder: ["timestamp", "method", "requestPath", "body"] as const, // VERIFY in clocked session
  signedRequestPathPrefix: "/build", // VERIFY in clocked session
  headers: {
    apiKey: "X-MBX-APIKEY", // VERIFY in clocked session
    signature: "X-WEB3-SIGNATURE", // VERIFY in clocked session
    timestamp: "X-WEB3-TIMESTAMP", // VERIFY in clocked session
  },
} as const

// Errors come back as HTTP 200 with the failure code inside the body (roost hint), so a real
// client checks the body `code`, never just the HTTP status. This flag documents that for the
// HttpWeb3ApiClient once it is wired.
export const ERRORS_RETURN_HTTP_200 = true // VERIFY in clocked session

// Assemble the canonical pre-hash string a signed request signs over. Pure string work, no
// crypto and no network, so it is safe to call before the human wires a key. For a signed
// path, pass the `/build`-prefixed requestPath.
export function canonicalSigningString(input: {
  timestamp: number | string
  method: string
  requestPath: string
  body?: string
}): string {
  const { timestamp, method, requestPath, body = "" } = input
  return `${timestamp}${method.toUpperCase()}${requestPath}${body}`
}

// Prefix a requestPath for signing, per the roost `/build` hint. Idempotent.
export function toSignedRequestPath(requestPath: string): string {
  return requestPath.startsWith(SIGNING.signedRequestPathPrefix)
    ? requestPath
    : `${SIGNING.signedRequestPathPrefix}${requestPath}`
}
