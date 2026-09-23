// On-chain constants for BNB Smart Chain. Read them at runtime, never assume.
import type { Address } from "viem"

export const BSC_CHAIN_ID = 56

// Endpoint tiers. PublicNode is fine for single or targeted reads (its terms forbid bulk scraping).
// The dataseed `bulk` tier is fast for state reads but REJECTS eth_getLogs, so log and history scans go
// to the `logs` tier: drpc serves getLogs for <=10000-block ranges free, publicnode is the fallback.
export const RPC_ENDPOINTS = {
  primary: "https://bsc-rpc.publicnode.com",
  fallbacks: ["https://bsc-dataseed.binance.org", "https://bsc-dataseed1.bnbchain.org"],
  bulk: "https://bsc-dataseed.bnbchain.org",
  logs: ["https://bsc.drpc.org", "https://bsc-rpc.publicnode.com"],
} as const

// Every genuine bStocks token is a beacon proxy pointing at this one shared beacon.
// Authenticity is checked by reading a token's EIP-1967 beacon slot and comparing to
// this, NEVER by symbol: the "bStocks" symbol is heavily scam-squatted on BSC.
export const BSTOCKS_BEACON: Address = "0x156d6DCe9A4F6139a3406F1f021F1a4880dE93A3"

// EIP-1967 beacon slot: keccak256("eip1967.proxy.beacon") - 1
export const EIP1967_BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50" as const

// Canonical BSC-USDT (BSC-USD), the quote token for the bStocks pools.
export const USDT: Address = "0x55d398326f99059fF775485246999027B3197955"

// bStocks tokens sighted during research. AAPLB and NVDAB were re-derived on chain in
// this lane; the rest are agent-reported. The reader verifies EVERY address by beacon at
// runtime before trusting it, so a wrong entry here is caught, not trusted. QQQB is marked
// disputed because one research pass flagged 0x2058... as a look-alike, the beacon check
// settles it empirically.
export const BSTOCKS_CANDIDATES: Record<string, Address> = {
  AAPLB: "0x431a3BEE82E2ca41e49895CbECE5bB0F76A89b7A",
  NVDAB: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436",
  TSLAB: "0x5b1910eAaD6450E50f816082Aa078C41F10C292f",
  MSFTB: "0x80106cb3EAD06659A5ad19DF39D9b4733863B9b0",
  GOOGLB: "0x3F53De71c126BdaBAe20f9cD64848d317f6C3238",
  SPYB: "0x7138b48df7D98D7e3cc221BfE7192D0a178182D8",
  QQQB_disputed: "0x205812CdBed920aFf76C6580abD681a46D11efc7",
}

// A known "bStocks" name-squatting scam token. It must FAIL the beacon check. Used to
// prove the authenticity check discriminates rather than passing everything.
export const KNOWN_SCAM_CLONE: Address = "0x244B112Cf746e62A5DF723cbDe9906a6dEfd7777"
