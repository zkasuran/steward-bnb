// Pure display helpers, safe on the server and in the browser. No SDK or viem import, so a
// client component can format numbers the route handler already turned into plain JS values.

export const BSC_CHAIN_ID = 56
export const BSC_CHAIN_NAME = "BNB Smart Chain"

const BSCSCAN = "https://bscscan.com"
export const bscScanAddress = (a: string) => `${BSCSCAN}/address/${a}`
export const bscScanToken = (a: string) => `${BSCSCAN}/token/${a}`
export const bscScanTx = (h: string) => `${BSCSCAN}/tx/${h}`
export const bscScanBlock = (n: number | string) => `${BSCSCAN}/block/${n}`

// 0x1234…abcd. A horizontal ellipsis, never a dash, so the pre-send style grep stays clean.
export function shortAddr(a?: string | null, lead = 6, tail = 4): string {
  if (!a) return "unknown"
  if (a.length <= lead + tail + 2) return a
  return `${a.slice(0, lead)}…${a.slice(-tail)}`
}

export function fmtUsd(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "unknown"
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
}

export function fmtNum(n: number | null | undefined, dp = 4): string {
  if (n == null || !Number.isFinite(n)) return "unknown"
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dp })
}

export function fmtPct(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "unknown"
  const s = n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
  return `${n > 0 ? "+" : ""}${s}%`
}

export function fmtInt(n: number | string | null | undefined): string {
  if (n == null) return "unknown"
  const v = typeof n === "string" ? Number(n) : n
  if (!Number.isFinite(v)) return String(n)
  return v.toLocaleString("en-US")
}

export function fmtWeight(frac: number | null | undefined): string {
  if (frac == null || !Number.isFinite(frac)) return "unknown"
  return `${(frac * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function fmtTimestamp(secs?: number | null): string {
  if (secs == null || !Number.isFinite(secs)) return ""
  return new Date(secs * 1000).toISOString().slice(0, 10)
}
