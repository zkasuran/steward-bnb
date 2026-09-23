// Two documents an ERC-8004 agent publishes, plus one parser for reading another agent's.
//
//  - parseAgentCard: read what an endpoint returned and turn it into a small typed shape. Three
//    machine shapes are live in the BSC population: an A2A agent card, an x402 payment challenge and
//    an OASF-style record. A browser page or plain text is reported as such rather than as a
//    capability. Lifted from the sibling reader and rewritten to this package's style.
//  - buildStewardAgentCard: the A2A card the Steward agent serves at its own endpoint.
//  - buildRegistrationDocument: the ERC-8004 registration-v1 JSON a tokenURI resolves to, plus the
//    data: URI encoder, because almost every agent on BSC stores that JSON inline as a base64 data URI
//    rather than at an http URL.
import { getAddress, type Address } from "viem"
import { BSC_CAIP2, IDENTITY_REGISTRY, USD1 } from "./constants.js"

export interface AgentCard {
  kind: "a2a" | "x402" | "oasf" | "json" | "html" | "text"
  name: string | null
  description: string | null
  url: string | null
  version: string | null
  skills: { id: string; name: string; description: string | null }[]
  capabilities: string[]
  accepts: { scheme: string; network: string; asset: string; amount: string }[]
  excerpt: string
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null
}

// Read an endpoint body into a typed card. Never fetches anything: the body is passed in.
export function parseAgentCard(body: string): AgentCard | null {
  if (!body || body.trim() === "") return null
  const excerpt = body.slice(0, 600)
  const head = body.slice(0, 400).trimStart().toLowerCase()
  if (head.startsWith("<!doctype") || head.startsWith("<html") || /<html[\s>]/.test(head)) {
    // A web page is an answer for a browser. Keep its title so a screenful of markup never renders as
    // if it were a capability record.
    const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(body)?.[1]?.trim() ?? null
    const desc =
      /<meta\s+name=["']description["']\s+content=["']([^"']{1,400})["']/i.exec(body)?.[1]?.trim() ?? null
    return { kind: "html", name: title, description: desc, url: null, version: null, skills: [], capabilities: [], accepts: [], excerpt: "" }
  }
  let o: Record<string, unknown>
  try {
    o = JSON.parse(body) as Record<string, unknown>
  } catch {
    return { kind: "text", name: null, description: null, url: null, version: null, skills: [], capabilities: [], accepts: [], excerpt }
  }
  if (!o || typeof o !== "object") return null
  const accepts = Array.isArray(o["accepts"])
    ? (o["accepts"] as Record<string, unknown>[]).map((a) => ({
        scheme: str(a["scheme"]) ?? "",
        network: str(a["network"]) ?? "",
        asset: str(a["asset"]) ?? "",
        // Both the x402 v1 name (maxAmountRequired) and the v2 name (amount) are live in the wild.
        amount: str(a["maxAmountRequired"] ?? a["amount"]) ?? "",
      }))
    : []
  const skillsRaw = Array.isArray(o["skills"]) ? (o["skills"] as unknown[]) : []
  const skills = skillsRaw
    .map((s) => {
      if (typeof s === "string") return { id: s, name: s, description: null }
      const so = (s ?? {}) as Record<string, unknown>
      return { id: str(so["id"]) ?? str(so["name"]) ?? "", name: str(so["name"]) ?? str(so["id"]) ?? "", description: str(so["description"]) }
    })
    .filter((s) => s.name)
  const caps =
    o["capabilities"] && typeof o["capabilities"] === "object"
      ? Object.entries(o["capabilities"] as Record<string, unknown>).filter(([, v]) => v === true).map(([k]) => k)
      : []
  const kind: AgentCard["kind"] =
    accepts.length > 0
      ? "x402"
      : o["protocolVersion"] || o["capabilities"] || (skills.length && o["url"])
        ? "a2a"
        : o["services"] || o["type"] === "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"
          ? "oasf"
          : "json"
  return {
    kind,
    name: str(o["name"]),
    description: str(o["description"]),
    url: str(o["url"]) ?? str(o["endpoint"]),
    version: str(o["version"]) ?? str(o["protocolVersion"]),
    skills,
    capabilities: caps,
    accepts,
    excerpt,
  }
}

// One skill the Steward agent advertises. Read-only monitoring and a guarded rebalance proposal, so
// it advises and it never signs on a holder's behalf.
export const STEWARD_SKILLS = [
  {
    id: "leash.monitor",
    name: "Guarded rebalance monitor",
    description:
      "Watches a holder's tokenized-stock basket and corporate actions, checks the pre-trade guard, then proposes a rebalance only inside a ticker allowlist, a per-position cap and a daily budget. Proposes, never signs.",
  },
  {
    id: "paycheck.route",
    name: "Dividend income rail",
    description:
      "Surfaces the silent dividend rebase as income and prepares a b402 (x402 v2) payment over USD1, returning the exact bytes to sign and the unsigned settle transaction.",
  },
] as const

export interface StewardCardOptions {
  // The agent's own base URL, where the card and its routes are served.
  origin: string
  // Where the agent settles b402 payments. Defaults to the house wallet.
  payTo?: Address
  agentId?: string
}

// The A2A-style agent card for the Steward agent. Kept to the fields a reader of parseAgentCard would
// classify as "a2a", plus an `accepts` block so an x402 client can see the payment rail.
export function buildStewardAgentCard(opts: StewardCardOptions): Record<string, unknown> {
  const origin = opts.origin.replace(/\/+$/, "")
  const payTo = getAddress(opts.payTo ?? "0xdb6c6340342e71a63cd11ebac2185204b7777777")
  return {
    protocolVersion: "0.2",
    name: "Steward",
    description:
      "Own-side agent for tokenized stocks on BNB Smart Chain: a guarded rebalance monitor (Leash) and a dividend income rail (Paycheck). Spot only.",
    url: origin,
    version: "0.0.1",
    capabilities: { streaming: false, pushNotifications: false },
    skills: STEWARD_SKILLS.map((s) => ({ id: s.id, name: s.name, description: s.description })),
    accepts: [
      {
        scheme: "eip3009",
        network: BSC_CAIP2,
        asset: USD1.address,
        // The amount is per-request and set at 402 time, so the card carries the rail, not a price.
        maxAmountRequired: "0",
        amount: "0",
        payTo,
      },
    ],
  }
}

export interface RegistrationDocumentOptions extends StewardCardOptions {
  // The agent's own wallet, distinct from the token owner when the operator wants a hot key for the
  // runtime. Defaults to payTo.
  agentWallet?: Address
}

// The ERC-8004 registration-v1 document, the JSON a tokenURI resolves to. `registrations[]` pins the
// CAIP-2 registry reference so a resolver knows which chain and contract this record belongs to.
export function buildRegistrationDocument(opts: RegistrationDocumentOptions): Record<string, unknown> {
  const origin = opts.origin.replace(/\/+$/, "")
  const payTo = getAddress(opts.payTo ?? "0xdb6c6340342e71a63cd11ebac2185204b7777777")
  const wallet = getAddress(opts.agentWallet ?? payTo)
  const registryCaip = `${BSC_CAIP2}:${IDENTITY_REGISTRY}`
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Steward",
    description:
      "Own-side agent for tokenized stocks on BNB Smart Chain. Guarded rebalance monitor plus a dividend income rail. Reads are free BSC RPC, writes are gated behind the operator's key.",
    image: "",
    active: true,
    x402Support: true,
    supportedTrust: ["reputation"],
    registrations: opts.agentId
      ? [{ agentId: opts.agentId, agentRegistry: registryCaip, agentAddress: wallet }]
      : [{ agentRegistry: registryCaip, agentAddress: wallet }],
    services: [
      { name: "A2A", endpoint: `${origin}/.well-known/agent.json`, version: "0.2", skills: STEWARD_SKILLS.map((s) => s.id) },
      { name: "web", endpoint: origin },
      { name: "x402", endpoint: `${origin}/paycheck`, asset: USD1.address },
    ],
  }
}

// Encode a registration document as the data:application/json;base64 URI that BSC agents store inline
// as their tokenURI. Returned so buildRegisterTx can pass it straight to register(agentURI).
export function toTokenUriDataUri(doc: Record<string, unknown>): string {
  const json = JSON.stringify(doc)
  return `data:application/json;base64,${Buffer.from(json, "utf8").toString("base64")}`
}
