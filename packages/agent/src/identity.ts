// ERC-8004 Identity Registry reads on BSC, plus the UNSIGNED registration transaction builder.
//
// Verified on chain 2026-09-24: the registry at IDENTITY_REGISTRY answers ownerOf, tokenURI and
// getAgentWallet. Its implementation carries a register(string) entry (selector 0xf2c298be). Two
// facts shape the reads, both carried from the sibling reader and consistent with the ERC-8004 draft:
// the registry is NOT ERC721Enumerable (totalSupply reverts, enumerate from logs). A tokenURI is
// almost always a data:application/json;base64 URI, so resolving a record is a decode, not a fetch.
//
// The registration event layout below is UNVERIFIED here: it is taken from the ERC-8004 draft and
// sibling research, not re-derived from a live log in this session. It is used only to name the
// agentId a submitted register() would emit, never to assert a fact outward.
import { getAddress, parseAbi, type Address, type PublicClient } from "viem"
import { makeClient } from "@steward/sdk"
import { IDENTITY_REGISTRY } from "./constants.js"
import { buildRegistrationDocument, toTokenUriDataUri, type RegistrationDocumentOptions } from "./card.js"
import { buildCall, type UnsignedTx } from "./tx.js"

export const IDENTITY_ABI = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function register(string agentURI) returns (uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
])

export interface Registration {
  name: string | null
  description: string | null
  // Absolute http(s) endpoints only. A relative or scheme-less value cannot be probed.
  endpoints: string[]
  // services[].name kinds, e.g. A2A, x402, web, MCP.
  serviceKinds: string[]
  // The operator's own claim that the agent speaks x402. Both spellings occur in the wild.
  declaresX402: boolean
  // The operator's own claim that the agent is running.
  declaresActive: boolean
  trustModels: string[]
  raw: unknown
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null
}

// Collect absolute http(s) endpoints from the several keys the population uses. A relative or
// scheme-less value is dropped because it cannot be probed.
function collectEndpoints(obj: Record<string, unknown>): string[] {
  const found = new Set<string>()
  const push = (v: unknown) => {
    const s = str(v)
    if (s && /^https?:\/\//i.test(s)) found.add(s)
  }
  push(obj["endpoint"])
  push(obj["url"])
  push(obj["homepage"])
  for (const key of ["endpoints", "services", "registrations", "interfaces"]) {
    const arr = obj[key]
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === "string") push(item)
        else if (item && typeof item === "object") {
          const o = item as Record<string, unknown>
          push(o["endpoint"])
          push(o["url"])
        }
      }
    }
  }
  return [...found]
}

// Decode one registration record. Handles the three shapes seen on BSC: a base64 data URI, a
// plain-text data URI and an http(s) URL that is deliberately NOT fetched here (fetching an
// operator-controlled URL belongs behind an SSRF guard in a prober, not in a read path).
export function parseRegistration(tokenUri: string): Registration | null {
  if (!tokenUri) return null
  let json: string | null = null
  if (tokenUri.startsWith("data:")) {
    const comma = tokenUri.indexOf(",")
    if (comma === -1) return null
    const meta = tokenUri.slice(5, comma)
    const bodyPart = tokenUri.slice(comma + 1)
    try {
      json = meta.includes("base64") ? Buffer.from(bodyPart, "base64").toString("utf8") : decodeURIComponent(bodyPart)
    } catch {
      return null
    }
  } else if (tokenUri.trimStart().startsWith("{")) {
    json = tokenUri
  } else {
    return null
  }
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
  const services = Array.isArray(obj["services"]) ? (obj["services"] as unknown[]) : []
  return {
    name: str(obj["name"]),
    description: str(obj["description"]),
    endpoints: collectEndpoints(obj),
    serviceKinds: services
      .map((s) => (s && typeof s === "object" ? str((s as Record<string, unknown>)["name"]) : null))
      .filter((s): s is string => s !== null),
    // Two spellings, both live. Reading only one undercounts.
    declaresX402: obj["x402support"] === true || obj["x402Support"] === true,
    declaresActive: obj["active"] === true,
    trustModels: [
      ...(Array.isArray(obj["supportedTrust"]) ? (obj["supportedTrust"] as unknown[]) : []),
      ...(Array.isArray(obj["supportedTrusts"]) ? (obj["supportedTrusts"] as unknown[]) : []),
    ]
      .map((v) => str(v))
      .filter((v): v is string => v !== null),
    raw: obj,
  }
}

export interface ResolvedAgent {
  agentId: string
  owner: Address | null
  agentWallet: Address | null
  tokenUri: string
  registration: Registration | null
}

// Resolve a batch of ids in one multicall: tokenURI, ownerOf and getAgentWallet for each, with
// per-call failure allowed so one bad id does not sink the batch.
export async function resolveAgents(ids: bigint[], client?: PublicClient): Promise<ResolvedAgent[]> {
  if (ids.length === 0) return []
  const c = client ?? makeClient()
  const calls = ids.flatMap((id) => [
    { address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "tokenURI", args: [id] } as const,
    { address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "ownerOf", args: [id] } as const,
    { address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "getAgentWallet", args: [id] } as const,
  ])
  const results = await c.multicall({ contracts: calls, allowFailure: true })
  return ids.map((id, i) => {
    const uri = results[i * 3]
    const owner = results[i * 3 + 1]
    const wallet = results[i * 3 + 2]
    const tokenUri = uri?.status === "success" ? String(uri.result) : ""
    return {
      agentId: id.toString(),
      owner: owner?.status === "success" ? getAddress(String(owner.result)) : null,
      agentWallet: wallet?.status === "success" ? getAddress(String(wallet.result)) : null,
      tokenUri,
      registration: parseRegistration(tokenUri),
    }
  })
}

// Resolve one agent id to its owner, wallet and decoded registration record.
export async function resolveAgent(agentId: bigint | string | number, client?: PublicClient): Promise<ResolvedAgent> {
  const id = BigInt(agentId)
  const [one] = await resolveAgents([id], client)
  return one
}

export interface RegisterTxResult {
  tx: UnsignedTx
  // The registration document that will be stored inline as the tokenURI.
  document: Record<string, unknown>
  tokenUri: string
}

// Build the UNSIGNED register(agentURI) transaction that mints the Steward agent's ERC-8004 identity.
// The registration document is encoded inline as a data: URI, the shape BSC agents use, so no external
// host has to stay up for the record to resolve. Nothing is signed or sent: the returned tx is a
// description the operator reviews and submits from the house wallet.
export function buildRegisterTx(opts: RegistrationDocumentOptions): RegisterTxResult {
  const document = buildRegistrationDocument(opts)
  const tokenUri = toTokenUriDataUri(document)
  const tx = buildCall({
    action: "ERC-8004 register(agentURI)",
    to: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: "register",
    args: [tokenUri],
    signature: "register(string agentURI) returns (uint256 agentId)",
    requires: ["a signer for the agent owner wallet", "BNB for gas"],
    note:
      "Mints a new ERC-8004 agent identity to the sender and stores the Steward registration document inline as the tokenURI. The emitted Registered event carries the new agentId.",
  })
  return { tx, document, tokenUri }
}
