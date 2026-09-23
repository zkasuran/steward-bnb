// Verified constants for the Steward Agent Studio agent. Every address marked VERIFIED was read from
// BSC mainnet on 2026-09-24 through a single targeted call (bsc-rpc.publicnode.com), not copied from a
// blog. Anything marked UNVERIFIED is carried from research and must be confirmed on chain (or in the
// human's clocked dev-portal session) before it is quoted outward or a transaction is sent.
//
// The rule the whole package inherits from the SDK: this file is a convenience, not the source of
// truth. Read decimals, domains and roles at runtime rather than trusting a table.
import { getAddress, type Address } from "viem"

// BNB Smart Chain mainnet. `cast chain-id` returned 56 on 2026-09-24. Spot only, BSC only.
export const BSC_CHAIN_ID = 56
export const BSC_CAIP2 = "eip155:56"

// zkasuran's public EOA, the default deployer, owner and payTo on every EVM chain. Public address
// only. The signing key never enters this package, a repo, a config or a log.
export const HOUSE_WALLET: Address = getAddress("0xdb6c6340342e71a63cd11ebac2185204b7777777")

// ERC-8004 Trustless Agents registries on BSC.
//
// IDENTITY_REGISTRY is VERIFIED on chain 2026-09-24: name() "AgentIdentity", symbol() "AGENT",
// supportsInterface(0x80ac58cd) true (ERC-721), ownerOf(1) 0x89E9E1ab11dD1B138b1dcE6d6A4a0926aaFD5029,
// getAgentWallet(1) the same address. It is an EIP-1967 proxy; the implementation behind
// IDENTITY_IMPL_SLOT read as IDENTITY_IMPL below.
export const IDENTITY_REGISTRY: Address = getAddress("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432")

// UNVERIFIED. Carried from sibling research. name() reverts on this address, so its shape could not be
// confirmed the way the identity registry was. Treat every reputation read as best-effort until a
// clocked session confirms the contract. Do not quote this address outward as settled.
export const REPUTATION_REGISTRY: Address = getAddress("0x8004BAa17C55a88189AE136b182e5fdA19dE9b63")

// EIP-1967 implementation slot, keccak256("eip1967.proxy.implementation") - 1. The identity registry
// is a proxy, so feature detection reads the code behind this slot rather than the proxy itself.
export const EIP1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const

// VERIFIED 2026-09-24: the implementation address behind IDENTITY_REGISTRY's EIP-1967 slot. Its
// runtime bytecode carries the register(string) (0xf2c298be), tokenURI(uint256) (0xc87b56dd) and
// ownerOf(uint256) (0x6352211e) selectors as PUSH4 dispatch entries, which is how the register write
// below was confirmed to exist rather than guessed.
export const IDENTITY_IMPL: Address = getAddress("0x7274e874CA62410a93Bd8bf61c69d8045E399c02")

// The two BSC stablecoins B402 settles over EIP-3009, each 18 decimals. USD1 is the default quote.
// Read decimals() at runtime anyway: code carried from a 6-decimal USDC chain is wrong here by a
// trillion.
export interface Eip3009Token {
  address: Address
  symbol: string
  decimals: number
  // The EIP-712 domain the token signs TransferWithAuthorization under.
  domain: { name: string; version: string }
  verified: boolean
  note: string
}

// VERIFIED 2026-09-24: eip712Domain() (ERC-5267) returned name "World Liberty Financial USD",
// version "1", chainId 56, verifyingContract the token itself; transferWithAuthorization(...)
// (0xe3ee160e) is present in the implementation bytecode. This is the honest default income rail.
export const USD1: Eip3009Token = {
  address: getAddress("0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d"),
  symbol: "USD1",
  decimals: 18,
  domain: { name: "World Liberty Financial USD", version: "1" },
  verified: true,
  note: "eip712Domain and transferWithAuthorization selector verified on chain 2026-09-24",
}

// Address, name and decimals VERIFIED 2026-09-24 (name() "United Stables", decimals 18). The domain
// VERSION is UNVERIFIED here: U's eip712Domain() reverts, so version "1" is the value sibling research
// derived by matching the on-chain DOMAIN_SEPARATOR. Re-derive before signing a U authorization.
export const U: Eip3009Token = {
  address: getAddress("0xcE24439F2D9C6a2289F741120FE202248B666666"),
  symbol: "U",
  decimals: 18,
  domain: { name: "United Stables", version: "1" },
  verified: false,
  note: "address and name verified on chain 2026-09-24; domain version derived not re-verified (eip712Domain reverts)",
}

export const EIP3009_TOKENS: Record<"USD1" | "U", Eip3009Token> = { USD1, U }

// x402 v2 / B402 wire version. B402 mainnet settlement is granted on request, so this package builds
// the signed authorization and the unsigned settle transaction, then stops there.
export const X402_VERSION = 2
