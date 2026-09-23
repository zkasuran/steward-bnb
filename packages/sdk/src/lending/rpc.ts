// The RPC pool for Venus reads. Every read here is current-block state (account snapshots,
// oracle prices, market lists), so it uses the interactive tier, primary endpoint first. A single
// flaky public node does not sink a read the next node would serve. These are plain BSC RPC reads,
// no Binance Web3 API and no key. Nothing here signs or sends a transaction.
import type { PublicClient } from "viem"
import { makeClient } from "../chain/bstocks.js"
import { RPC_ENDPOINTS } from "../chain/constants.js"

// Interactive read endpoints, primary first. Bulk/historical log sweeps are out of scope for the
// lending reader, so the bulk tier is intentionally unused here.
const READ_URLS: readonly string[] = [RPC_ENDPOINTS.primary, ...RPC_ENDPOINTS.fallbacks]

const clients = new Map<string, PublicClient>()
function clientFor(url: string): PublicClient {
  const existing = clients.get(url)
  if (existing) return existing
  const c = makeClient(url)
  clients.set(url, c)
  return c
}

// Run a read against each endpoint in order until one answers. Errors are collected, not
// swallowed, so a total failure names every endpoint tried and why each refused.
export async function withRpc<T>(fn: (client: PublicClient) => Promise<T>): Promise<T> {
  const errors: string[] = []
  for (const url of READ_URLS) {
    try {
      return await fn(clientFor(url))
    } catch (e) {
      errors.push(`${url}: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`)
    }
  }
  throw new Error(`every RPC endpoint refused:\n${errors.join("\n")}`)
}
