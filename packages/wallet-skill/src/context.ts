// Fills a SkillContext with keyless defaults: the mock Web3 API client (mock-until-key) and the SDK's
// built-in BSC reader. Nothing here needs a key, a signature or gas.
import { api, makeClient } from "@steward/sdk"
import type { PublicClient } from "viem"
import type { SkillContext } from "./types.js"

export interface ResolvedContext {
  api: api.Web3ApiClient
  apiIsMock: boolean
  publicClient: PublicClient
  now: Date
}

// Resolve a caller's context. When no api client is passed we use the keyless mock and flag it so a
// handler can label reference readings mock-until-key rather than presenting them as live.
export function resolveContext(ctx: SkillContext = {}): ResolvedContext {
  const client = ctx.api ?? new api.MockWeb3ApiClient()
  return {
    api: client,
    apiIsMock: client instanceof api.MockWeb3ApiClient,
    publicClient: ctx.publicClient ?? makeClient(),
    now: ctx.now ?? new Date(),
  }
}
