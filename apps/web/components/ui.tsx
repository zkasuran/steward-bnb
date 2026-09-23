// Shared presentational primitives for the Steward dashboard. Purely visual, so they render on
// either side of the server/client boundary. Colour tokens come from globals.css.
import type { ReactNode } from "react"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/cn"
import { bscScanAddress, bscScanToken, bscScanTx, bscScanBlock, shortAddr, BSC_CHAIN_NAME } from "@/lib/format"

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-line bg-panel p-5", className)}>{children}</section>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wider text-ink-dim">{children}</div>
}

export function CardTitle({ title, sub, icon }: { title: string; sub?: string; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {icon ? <div className="mt-0.5 text-brand">{icon}</div> : null}
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {sub ? <p className="mt-1 text-sm leading-relaxed text-ink-dim">{sub}</p> : null}
      </div>
    </div>
  )
}

type Tone = "genuine" | "scam" | "warn" | "info" | "neutral" | "brand"
const TONE: Record<Tone, string> = {
  genuine: "border-up/40 bg-up/10 text-up",
  scam: "border-down/40 bg-down/10 text-down",
  warn: "border-warn/40 bg-warn/10 text-warn",
  info: "border-info/40 bg-info/10 text-info",
  neutral: "border-line bg-panel-2 text-ink-soft",
  brand: "border-brand/40 bg-brand/10 text-brand",
}

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function AddrLink({ address, kind = "address" }: { address?: string | null; kind?: "address" | "token" | "tx" }) {
  if (!address) return <span className="unknown">unknown</span>
  const href = kind === "token" ? bscScanToken(address) : kind === "tx" ? bscScanTx(address) : bscScanAddress(address)
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="num inline-flex items-center gap-1 text-ink-soft hover:text-brand"
      title={`${address} on BscScan`}
    >
      {shortAddr(address)}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  )
}

// Every on-chain read shows which chain and block it came from, linking the block to BscScan.
export function SourceTag({ chainId, atBlock }: { chainId: number; atBlock: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
      <span className="inline-flex items-center gap-1 rounded-md border border-line bg-panel-2 px-2 py-0.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
        {BSC_CHAIN_NAME} · chain {chainId}
      </span>
      {atBlock != null ? (
        <a
          href={bscScanBlock(atBlock)}
          target="_blank"
          rel="noreferrer"
          className="num inline-flex items-center gap-1 hover:text-brand"
          title="This read on BscScan"
        >
          block {atBlock.toLocaleString("en-US")}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      ) : null}
    </div>
  )
}

export function MockTag({ what = "reference price" }: { what?: string }) {
  return (
    <Badge tone="warn" className="font-normal">
      {what}: mock until the Web3 API key is wired
    </Badge>
  )
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: "up" | "down" | "warn" | "ink"
}) {
  const color =
    tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "warn" ? "text-warn" : "text-ink"
  return (
    <div className="rounded-md border border-line-soft bg-panel-2 px-3 py-2.5">
      <div className="text-xs text-ink-dim">{label}</div>
      <div className={cn("num mt-1 text-lg font-semibold", color)}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-ink-faint">{sub}</div> : null}
    </div>
  )
}

export function KeyVal({ k, v, mono = true }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-ink-dim">{k}</span>
      <span className={cn("text-right text-sm text-ink-soft", mono && "num")}>{v}</span>
    </div>
  )
}

export function Loading({ label = "Reading BNB Smart Chain…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-6 text-sm text-ink-dim" role="status" aria-live="polite">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand"
        aria-hidden
      />
      {label}
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-down/40 bg-down/10 px-4 py-3 text-sm text-down" role="alert">
      <span className="font-semibold">Read failed. </span>
      {message}
    </div>
  )
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-ink-dim">{children}</div>
}
