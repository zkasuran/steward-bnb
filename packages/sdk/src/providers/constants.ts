// Cross-provider constants: the same underlying equity issued by three different families on BSC.
//
//   bStocks  (deep, tradeable)  beacon-proxy tokens, authenticity by the EIP-1967 beacon slot.
//   Ondo     (thin)             Ondo Stocks tokens, authenticity by MINTER_ROLE granted to the
//                                 official GMTokenManager (a cryptographic bind, not a name match).
//   xStocks  (dust / absent)    Backed Finance tokens, authenticity by an on-chain heuristic
//                                 (Backed's own terms() URL) plus a curated allowlist. NO cryptographic
//                                 anchor comparable to the other two is verified in this module.
//
// Every address here was re-derived on BSC mainnet (chain 56) in the 2026-09-24 build session unless a
// registry row marks `reverified: false`. The reader re-checks each token's authenticity live at
// call time regardless, so a stale entry is caught rather than trusted. These are plain BSC RPC reads,
// no Binance Web3 API, so nothing here needs a key.
import { parseAbi, type Address } from "viem"
import { BSTOCKS_CANDIDATES } from "../chain/constants.js"

export type ProviderFamily = "bStocks" | "ondo" | "xStocks"

// --- Ondo Stocks (BNB Chain) --------------------------------------------------------------------
// Official GMTokenManager, published on docs.ondo.finance/addresses. A genuine Ondo Stocks token
// grants it MINTER_ROLE, verified live via hasRole. GMTokenManager.usdon() returns ONDO_USDON,
// cross-checked this session, which ties the token set to the official contracts.
export const ONDO_GM_TOKEN_MANAGER: Address = "0x91f8Aff3738825e8eB16FC6f6b1A7A4647bDB299"
// keccak256("MINTER_ROLE"), confirmed with `cast keccak "MINTER_ROLE"` this session.
export const ONDO_MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6" as const
// Ondo's settlement stablecoin on BSC; GMTokenManager.usdon() == this, verified 2026-09-24.
export const ONDO_USDON: Address = "0x1f8955E640Cbd9abc3C3Bb408c9E2E1f5F20DfE6"

// OpenZeppelin AccessControl, the interface Ondo's tokens expose for the minter-role bind.
export const ACCESS_CONTROL_ABI = parseAbi(["function hasRole(bytes32 role, address account) view returns (bool)"])

// --- xStocks (Backed Finance) -------------------------------------------------------------------
// Backed's tokens expose terms() returning their legal-documentation URL. This is a HEURISTIC, not a
// cryptographic bind: any contract can echo the same string, so it is a strong signal that a token is
// Backed-issued, not proof. It is treated that way. TSLAx returned exactly this URL this session.
export const BACKED_TOKEN_ABI = parseAbi(["function terms() view returns (string)"])
export const BACKED_TERMS_URL = "https://www.backedassets.fi/legal-documentation"
// Shared implementation behind TSLAx's EIP-1967 proxy, read this session. Only ONE xStock was bound on
// chain here, so using this as a shared-impl anchor across xStocks is UNVERIFIED; kept for provenance.
export const XSTOCK_TSLAX_IMPL = "0x65c40d624af3b18c109fbf87b7deff34cdc5f19b" as const

// Curated allowlist of known Backed xStock token addresses on BSC (lowercased). Minimal on purpose:
// only TSLAx is bound on chain this session. xStocks' real markets are Solana and X Layer, so the BSC
// roster is small and its liquidity is dust. Extend only with an address re-verified on chain.
export const XSTOCK_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0", // TSLAx (Tesla xStock), verified 2026-09-24
])

// --- The cross-provider registry ----------------------------------------------------------------
// underlying ticker -> the token representing it on each family present on BSC. bStocks addresses are
// pulled from chain/constants so there is one source for them, not two that can drift.
export interface RegistryListing {
  family: ProviderFamily
  address: Address
  // Which authenticity anchor the reader checks live for this family.
  anchor: "beacon" | "minter-role" | "backed-heuristic"
  // True when this exact address was re-derived on chain in the 2026-09-24 session. When false the
  // reader still verifies it live at call time; the flag only records what was pre-checked.
  reverified: boolean
  // Provenance for the packet and the DevEx report.
  source: string
}

const MINTER = "minter-role" as const
const BEACON = "beacon" as const
const BACKED = "backed-heuristic" as const

export const CROSS_PROVIDER_REGISTRY: Record<string, RegistryListing[]> = {
  TSLA: [
    { family: "bStocks", address: BSTOCKS_CANDIDATES.TSLAB, anchor: BEACON, reverified: true, source: "TSLAB beacon slot re-read 2026-09-24" },
    { family: "ondo", address: "0x2494b603319d4D9F9715c9f4496d9E0364B59d93", anchor: MINTER, reverified: true, source: "TSLAon MINTER_ROLE bind re-verified 2026-09-24" },
    { family: "xStocks", address: "0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0", anchor: BACKED, reverified: true, source: "TSLAx terms()+impl read 2026-09-24; dust on BSC" },
  ],
  NVDA: [
    { family: "bStocks", address: BSTOCKS_CANDIDATES.NVDAB, anchor: BEACON, reverified: true, source: "NVDAB beacon slot re-read 2026-09-24" },
    { family: "ondo", address: "0xA9eE28C80f960B889dFbd1902055218cBa016F75", anchor: MINTER, reverified: true, source: "NVDAon MINTER_ROLE bind re-verified 2026-09-24" },
  ],
  AAPL: [
    { family: "bStocks", address: BSTOCKS_CANDIDATES.AAPLB, anchor: BEACON, reverified: true, source: "AAPLB beacon slot re-read 2026-09-24" },
    { family: "ondo", address: "0x390a684EF9cADE28A7AD0DFa61AB1Eb3842618c4", anchor: MINTER, reverified: true, source: "AAPLon MINTER_ROLE bind re-verified 2026-09-24" },
  ],
  SPY: [
    { family: "bStocks", address: BSTOCKS_CANDIDATES.SPYB, anchor: BEACON, reverified: false, source: "SPYB agent-reported; runtime beacon check settles it" },
    { family: "ondo", address: "0x6a708EAD771238919D85930b5a0f10454E1C331a", anchor: MINTER, reverified: true, source: "SPYon MINTER_ROLE bind re-verified 2026-09-24" },
  ],
  GLD: [
    { family: "ondo", address: "0xfA9a1E901085e269f6D428F79Cd5252d8b919344", anchor: MINTER, reverified: true, source: "GLDon MINTER_ROLE bind re-verified 2026-09-24; no bStocks GLD known" },
  ],
  MSFT: [
    { family: "bStocks", address: BSTOCKS_CANDIDATES.MSFTB, anchor: BEACON, reverified: false, source: "MSFTB agent-reported; runtime beacon check settles it" },
  ],
  GOOGL: [
    { family: "bStocks", address: BSTOCKS_CANDIDATES.GOOGLB, anchor: BEACON, reverified: false, source: "GOOGLB agent-reported; runtime beacon check settles it" },
  ],
  QQQ: [
    { family: "bStocks", address: BSTOCKS_CANDIDATES.QQQB_disputed, anchor: BEACON, reverified: false, source: "QQQB flagged disputed by one research pass; runtime beacon check settles it empirically" },
  ],
}

// Every underlying the registry knows a representation for.
export const KNOWN_UNDERLYINGS: string[] = Object.keys(CROSS_PROVIDER_REGISTRY)
