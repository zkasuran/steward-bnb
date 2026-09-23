// DevEx instrument. Wrap any Web3ApiClient so every call's latency and outcome is logged, which is
// the raw material the human's Developer Experience Report is written from (per-endpoint latency,
// which calls errored and with what message). The SDK stays generic: it takes a log sink callback,
// so the caller decides where entries go (the lane's .hq/devex-log.jsonl in the clocked session).
// Normal Node runtime, so Date.now() is fine here.
import type { Web3ApiClient } from "./client.js"

export type DevexLogEntry = {
  ts: number
  method: string
  ms: number
  ok: boolean
  error?: string
}

// Returns a proxy that behaves exactly like the wrapped client and logs one entry per call.
export function instrumentWeb3Api(
  client: Web3ApiClient,
  log: (entry: DevexLogEntry) => void,
): Web3ApiClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver)
      if (typeof orig !== "function") return orig
      return async (...args: unknown[]) => {
        const start = Date.now()
        try {
          const result = await (orig as (...a: unknown[]) => Promise<unknown>).apply(target, args)
          log({ ts: start, method: String(prop), ms: Date.now() - start, ok: true })
          return result
        } catch (e) {
          log({ ts: start, method: String(prop), ms: Date.now() - start, ok: false, error: e instanceof Error ? e.message : String(e) })
          throw e
        }
      }
    },
  }) as Web3ApiClient
}
