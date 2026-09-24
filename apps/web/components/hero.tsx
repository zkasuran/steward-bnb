"use client"

// The hero: the front door. A top bar carries the wordmark, the chain badge and the theme toggle;
// below it the value proposition sits beside one live proof element, an authenticity read of a real
// bStock on BSC mainnet next to the known look-alike it is told apart from. The soft brand pool
// behind it is the .hero-glow from globals.css, pure CSS so there is no image licence to carry.
import { useEffect } from "react"
import { ShieldCheck, ShieldAlert, Link2 } from "lucide-react"
import { ThemeToggle } from "./theme-toggle"
import { useEndpoint } from "./use-endpoint"
import { Badge } from "./ui"
import { SCAM_CLONE } from "@/lib/known"
import { fmtUsd, shortAddr, bscScanBlock, bscScanToken } from "@/lib/format"
import type { CompareResponse } from "@/lib/types"

const PROOF_UNDERLYING = "TSLA"

export function Hero() {
  return (
    <div className="relative isolate overflow-x-clip">
      <div className="hero-glow" aria-hidden />

      <header className="relative z-10 flex items-center justify-between gap-3 pb-8 pt-1">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-on-brand shadow-[var(--shadow-1)]"
            aria-hidden
          >
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span className="text-xl font-semibold tracking-tight text-ink">Steward</span>
          <span className="hidden items-center gap-1.5 rounded-md border border-line bg-panel/70 px-2 py-0.5 text-xs text-ink-dim sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
            BNB Smart Chain
          </span>
        </div>
        <ThemeToggle />
      </header>

      <section className="relative z-10 grid items-center gap-8 pb-10 md:grid-cols-[1.15fr_1fr] md:gap-10 md:pb-12">
        <div className="rise">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-dim">
            Own-side, not buy-side
          </div>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl">
            Own a tokenized stock.
            <br />
            <span className="text-ink-soft">Do not just buy one.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft">
            Steward is the whole life of a holding on BNB Smart Chain. Know what you truly own, grow it on
            your convictions and use it safely, all from real mainnet reads.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge tone="brand">Reads only</Badge>
            <Badge tone="neutral">Spot only, no perps</Badge>
            <Badge tone="neutral">No sign, no spend</Badge>
          </div>
        </div>

        <HeroProof />
      </section>
    </div>
  )
}

// One live proof, read on mount: a real bStock resolved by its on-chain beacon on BSC mainnet,
// shown next to a known look-alike the same check rejects. The genuine box only turns green once a
// live authentic read lands, so nothing here asserts a result it has not read. If the read is slow
// or the free RPC refuses a cloud IP, it stays neutral and describes the mechanism instead.
function HeroProof() {
  const { data, loading, call } = useEndpoint<CompareResponse>()

  useEffect(() => {
    call(`/api/providers?underlying=${PROOF_UNDERLYING}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bstock = data?.representations.find((r) => r.family.toLowerCase().includes("bstock")) ?? null
  const live = bstock?.authentic ? bstock : null

  return (
    <div className="elevate-1 rise rounded-xl border border-line bg-panel/80 p-5 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
          Genuine or scam, proven on-chain
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
          <span
            className={cnDot(loading, !!live)}
            aria-hidden
          />
          {loading ? "reading BSC" : live ? "live" : "on-chain"}
        </span>
      </div>

      {/* Live: a real bStock, told apart by its beacon. Neutral until an authentic read lands. */}
      <div
        className={
          live
            ? "mt-4 rounded-lg border border-up/30 bg-up/10 p-3.5"
            : "mt-4 rounded-lg border border-line-soft bg-panel-2 p-3.5"
        }
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">{live?.symbol ?? `${PROOF_UNDERLYING}B`}</span>
            <span className="text-xs text-ink-faint">Tesla</span>
          </span>
          {live ? (
            <Badge tone="genuine">
              <ShieldCheck className="h-3 w-3" aria-hidden /> genuine
            </Badge>
          ) : (
            <Badge tone={loading ? "info" : "neutral"}>
              <ShieldCheck className="h-3 w-3" aria-hidden /> {loading ? "verifying" : "beacon check"}
            </Badge>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="text-ink-soft">
            {live ? "Verified by its on-chain beacon" : "Resolved by its on-chain beacon, never by symbol"}
          </span>
          {live?.spotUsdt != null ? <span className="num text-ink-soft">{fmtUsd(live.spotUsdt)} spot</span> : null}
        </div>
        {live?.atBlock != null ? (
          <a
            href={bscScanBlock(live.atBlock)}
            target="_blank"
            rel="noreferrer"
            className="num mt-1.5 inline-flex items-center gap-1 text-xs text-ink-faint hover:text-brand"
          >
            <Link2 className="h-3 w-3" aria-hidden /> read at block {live.atBlock.toLocaleString("en-US")}
          </a>
        ) : null}
      </div>

      {/* Static contrast: a known look-alike the same check rejects, so Guard blocks the buy. */}
      <div className="mt-2.5 rounded-lg border border-down/30 bg-down/10 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-semibold text-ink">Look-alike clone</span>
            <a
              href={bscScanToken(SCAM_CLONE.address)}
              target="_blank"
              rel="noreferrer"
              className="num truncate text-xs text-ink-faint hover:text-brand"
            >
              {shortAddr(SCAM_CLONE.address)}
            </a>
          </span>
          <Badge tone="scam">
            <ShieldAlert className="h-3 w-3" aria-hidden /> scam
          </Badge>
        </div>
        <p className="mt-2 text-xs text-ink-soft">Fails the same beacon check, so Guard blocks the buy.</p>
      </div>
    </div>
  )
}

// The status dot: amber while reading, green once a live authentic read lands, muted otherwise.
function cnDot(loading: boolean, live: boolean): string {
  const base = "live-dot inline-block h-1.5 w-1.5 rounded-full"
  if (loading) return `${base} bg-warn`
  if (live) return `${base} bg-up`
  return `${base} bg-ink-faint`
}
