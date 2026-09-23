// Cross-provider detection helpers. Each answers one question: is this token a genuine member of a
// given tokenized-stock family on BSC? bStocks has its own beacon check in ../chain/bstocks.ts and is
// re-exported from ./index.ts; this file adds Ondo and xStocks. All reads are plain BSC RPC, no key.
import { getAddress, type Address, type PublicClient } from "viem"
import {
  ACCESS_CONTROL_ABI,
  BACKED_TERMS_URL,
  BACKED_TOKEN_ABI,
  ONDO_GM_TOKEN_MANAGER,
  ONDO_MINTER_ROLE,
  XSTOCK_ALLOWLIST,
} from "./constants.js"

// A token is a genuine Ondo Stocks token iff it grants MINTER_ROLE to Ondo's official GMTokenManager.
// This is a cryptographic bind, not a name match: only the manager the token authorises can mint it,
// so a copycat that merely reuses the "AAPLon" symbol fails here. Returns false on any token that does
// not expose OpenZeppelin AccessControl (the call reverts), rather than throwing.
export async function isOndoToken(client: PublicClient, token: Address): Promise<boolean> {
  try {
    return await client.readContract({
      address: getAddress(token),
      abi: ACCESS_CONTROL_ABI,
      functionName: "hasRole",
      args: [ONDO_MINTER_ROLE, ONDO_GM_TOKEN_MANAGER],
    })
  } catch {
    return false
  }
}

// A HEURISTIC check for a Backed Finance xStock, not a cryptographic proof. Two signals, in order:
//   1. membership in the curated allowlist (authoritative, but manually maintained), then
//   2. terms() returning Backed's legal-documentation URL (a strong signal any contract could echo).
// There is no verified shared-implementation or role anchor for xStocks in this module, because only
// one xStock was bound on chain this session, so this is deliberately labelled a heuristic wherever it
// is surfaced. xStocks carry dust or no BSC DEX liquidity regardless of authenticity.
export async function isXStock(client: PublicClient, token: Address): Promise<boolean> {
  const addr = getAddress(token)
  if (XSTOCK_ALLOWLIST.has(addr.toLowerCase())) return true
  try {
    const terms = await client.readContract({ address: addr, abi: BACKED_TOKEN_ABI, functionName: "terms" })
    return typeof terms === "string" && terms.trim().toLowerCase() === BACKED_TERMS_URL
  } catch {
    return false
  }
}
