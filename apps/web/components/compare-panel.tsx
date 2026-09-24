"use client"

// Cross-Provider: the same underlying equity across bStocks, Ondo and xStocks on BSC. Read-only,
// with the honest headline that a DEX arb across the three is not executable on today's liquidity.
import { useEffect, useState } from "react"
import { GitCompareArrows, TriangleAlert } from "lucide-react"
import { useEndpoint } from "./use-endpoint"
import { AddrLink, Badge, Card, CardTitle, EmptyNote, ErrorNote, Loading, SourceTag } from "./ui"
import { fmtUsd } from "@/lib/format"
import type { CompareResponse, RepresentationDTO } from "@/lib/types"

const DEPTH_TONE: Record<string, "genuine" | "warn" | "info" | "neutral"> = {
  deep: "genuine",
  thin: "warn",
  dust: "info",
  none: "neutral",
}

export function ComparePanel() {
  const roster = useEndpoint<{ knownUnderlyings: string[] }>()
  const cmp = useEndpoint<CompareResponse>()
  const [selected, setSelected] = useState("")

  useEffect(() => {
    roster.call("/api/providers")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const list = roster.data?.knownUnderlyings ?? []
  const active = selected || (list.includes("TSLA") ? "TSLA" : list[0]) || ""

  useEffect(() => {
    if (active) cmp.call(`/api/providers?underlying=${active}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardTitle
          title="Cross-Provider comparison"
          eyebrow="Compare"
          icon={<GitCompareArrows className="h-5 w-5" />}
          sub="One equity, three tokenized-stock families on BSC: bStocks, Ondo and xStocks. Authenticity is checked live for each and priced from a real pool where one exists."
        />
        {roster.loading ? <Loading label="Loading underlyings…" /> : null}
        {roster.error ? <ErrorNote message={roster.error} /> : null}
        <div className="flex flex-wrap gap-2">
          {list.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setSelected(u)}
              aria-pressed={u === active}
              className={`num rounded-md border px-3 py-1.5 text-sm font-medium transition duration-200 ${
                u === active
                  ? "border-brand bg-brand/10 text-brand shadow-[var(--shadow-1)]"
                  : "border-line bg-panel-2 text-ink-soft hover:-translate-y-0.5 hover:border-line hover:text-ink"
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </Card>

      {cmp.loading ? (
        <Card>
          <Loading />
        </Card>
      ) : null}
      {cmp.error ? (
        <Card>
          <ErrorNote message={cmp.error} />
        </Card>
      ) : null}
      {cmp.data ? <CompareView data={cmp.data} /> : null}
    </div>
  )
}

function CompareView({ data }: { data: CompareResponse }) {
  return (
    <Card className="rise">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">{data.underlying} across families</h2>
        <Badge tone="scam">
          <TriangleAlert className="h-3 w-3" aria-hidden /> arb not executable
        </Badge>
      </div>

      {data.representations.length === 0 ? (
        <EmptyNote>No representation of {data.underlying} is registered across the three families.</EmptyNote>
      ) : (
        <div className="flex flex-col gap-3">
          {data.representations.map((r) => (
            <RepRow key={`${r.family}-${r.address}`} r={r} />
          ))}
        </div>
      )}

      <div className="mt-4 rounded-md border border-warn/40 bg-warn/10 p-4 text-sm leading-relaxed text-ink-soft">
        <span className="font-semibold text-warn">Honest note. </span>
        {data.honesty}
      </div>
    </Card>
  )
}

function RepRow({ r }: { r: RepresentationDTO }) {
  return (
    <div className="rounded-md border border-line-soft bg-panel-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">{r.family}</span>
          <span className="text-xs text-ink-faint">{r.symbol ?? r.name ?? ""}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {r.authentic ? <Badge tone="genuine">authentic</Badge> : <Badge tone="scam">not verified</Badge>}
          <Badge tone={DEPTH_TONE[r.depth] ?? "neutral"}>{r.depth} liquidity</Badge>
          {r.tradeable ? <Badge tone="genuine">tradeable on BSC</Badge> : <Badge tone="neutral">not tradeable in size</Badge>}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <div className="text-xs text-ink-dim">Spot (USDT)</div>
          <div className="num text-ink-soft">{r.spotUsdt == null ? <span className="unknown">no pool</span> : fmtUsd(r.spotUsdt)}</div>
        </div>
        <div>
          <div className="text-xs text-ink-dim">Pool USDT</div>
          <div className="num text-ink-soft">{r.poolUsdtReserve == null ? <span className="unknown">unknown</span> : fmtUsd(r.poolUsdtReserve)}</div>
        </div>
        <div className="col-span-2">
          <div className="text-xs text-ink-dim">Token</div>
          <AddrLink address={r.address} kind="token" />
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-faint">{r.authenticity}. {r.liquidityNote}</p>
      {r.atBlock != null ? (
        <div className="mt-2">
          <SourceTag chainId={56} atBlock={r.atBlock} />
        </div>
      ) : null}
    </div>
  )
}
