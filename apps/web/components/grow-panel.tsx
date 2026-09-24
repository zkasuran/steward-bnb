"use client"

// GROW: Conviction baskets. A basket is a target-weight rule over genuine bStocks. Pick one,
// analyse it against a wallet to see current weights, drift versus target and a plan-only
// rebalance. The plan is gated: nothing here signs, sends or spends.
import { useEffect, useState } from "react"
import { Layers, Scale, Lock } from "lucide-react"
import { useEndpoint } from "./use-endpoint"
import { AddressField } from "./address-field"
import { WeightBar, DriftBar } from "./charts"
import { AddrLink, Badge, Card, CardTitle, EmptyNote, ErrorNote, Loading, SourceTag, Stat } from "./ui"
import { fmtUsd, fmtWeight, fmtPct } from "@/lib/format"
import type { AnalyzeResponse, BasketSummaryDTO } from "@/lib/types"

export function GrowPanel({ address, setAddress }: { address: string; setAddress: (v: string) => void }) {
  const baskets = useEndpoint<{ baskets: BasketSummaryDTO[] }>()
  const analysis = useEndpoint<AnalyzeResponse>()
  const [selected, setSelected] = useState<string>("")

  useEffect(() => {
    baskets.call("/api/grow/baskets")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const list = baskets.data?.baskets ?? []
  const activeId = selected || list[0]?.id || ""
  const active = list.find((b) => b.id === activeId)

  const analyze = () => {
    if (activeId) analysis.call(`/api/grow/analyze?address=${address.trim()}&basketId=${activeId}`)
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardTitle
          title="Conviction baskets"
          eyebrow="Grow"
          icon={<Layers className="h-5 w-5" />}
          sub="A basket is a thesis expressed as target weights over genuine bStocks. Pick one, then analyse it against a wallet to see how far the real holding has drifted and what a rebalance would do."
        />
        {baskets.loading ? <Loading label="Loading baskets…" /> : null}
        {baskets.error ? <ErrorNote message={baskets.error} /> : null}
        <div className="grid gap-3 md:grid-cols-3">
          {list.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelected(b.id)}
              className={`rounded-lg border p-3.5 text-left transition duration-200 ${
                b.id === activeId
                  ? "border-brand bg-brand/10 shadow-[var(--shadow-1)]"
                  : "border-line-soft bg-panel-2 hover:-translate-y-0.5 hover:border-line hover:shadow-[var(--shadow-1)]"
              }`}
              aria-pressed={b.id === activeId}
            >
              <div className="text-sm font-semibold text-ink">{b.name}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {b.weights.map((w) => (
                  <span key={w.ticker} className="num rounded bg-canvas/60 px-1.5 py-0.5 text-xs text-ink-dim">
                    {w.ticker} {fmtWeight(w.weight)}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
        {active ? <p className="mt-3 text-sm leading-relaxed text-ink-dim">{active.description}</p> : null}
      </Card>

      <Card>
        <AddressField value={address} onChange={setAddress} onSubmit={analyze} cta="Analyze against wallet" />
        {analysis.loading ? <Loading /> : null}
        {analysis.error ? (
          <div className="mt-4">
            <ErrorNote message={analysis.error} />
          </div>
        ) : null}
      </Card>

      {analysis.data ? <AnalysisView data={analysis.data} /> : null}
    </div>
  )
}

function AnalysisView({ data }: { data: AnalyzeResponse }) {
  const scaleMax = Math.max(1, ...data.legs.map((l) => Math.abs(l.driftPct)))
  return (
    <>
      <Card className="rise">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CardTitle title={data.name} icon={<Scale className="h-5 w-5" />} />
          <SourceTag chainId={data.chainId} atBlock={data.atBlock} />
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Portfolio value" value={fmtUsd(data.portfolioValueUsd)} sub="priced from on-chain pools" />
          <Stat label="Legs" value={data.legs.length} sub={`${data.legs.filter((l) => l.genuine).length} genuine`} />
          <Stat
            label="Valuation"
            value={data.complete ? "complete" : "partial"}
            tone={data.complete ? "up" : "warn"}
            sub={data.complete ? "every held leg priced" : "a held leg is unpriced"}
          />
        </div>

        {data.portfolioValueUsd <= 0 ? (
          <EmptyNote>
            This wallet holds none of the basket legs yet, so there is no current weight to drift. The target
            weights above are the plan a first purchase would follow.
          </EmptyNote>
        ) : (
          <div className="flex flex-col gap-3">
            {data.legs.map((l) => (
              <div key={l.token} className="rounded-md border border-line-soft bg-panel-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{l.ticker}</span>
                    {!l.genuine ? <Badge tone="scam">not genuine</Badge> : null}
                    {l.priceUsd == null && Number(l.balanceHuman) > 0 ? <Badge tone="warn">unpriced</Badge> : null}
                  </span>
                  <span className="num text-sm text-ink-soft">{fmtUsd(l.valueUsd)}</span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-ink-dim">
                      <span>weight now {fmtWeight(l.currentWeight)}</span>
                      <span>target {fmtWeight(l.targetWeight)}</span>
                    </div>
                    <WeightBar targetWeight={l.targetWeight} currentWeight={l.currentWeight} />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-ink-dim">
                      <span>drift</span>
                      <span className={l.driftPct > 0 ? "text-down" : l.driftPct < 0 ? "text-info" : ""}>
                        {fmtPct(l.driftPct)} {l.driftPct > 0 ? "over" : l.driftPct < 0 ? "under" : ""}
                      </span>
                    </div>
                    <DriftBar driftPct={l.driftPct} scaleMax={scaleMax} />
                  </div>
                </div>
                <div className="mt-2 text-xs">
                  <AddrLink address={l.token} kind="token" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <PlanView data={data} />
    </>
  )
}

function PlanView({ data }: { data: AnalyzeResponse }) {
  const { plan } = data
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <CardTitle title="Rebalance plan" />
        <Badge tone="info">
          <Lock className="h-3 w-3" aria-hidden /> plan only, gated
        </Badge>
      </div>
      {plan.legs.length === 0 ? (
        <EmptyNote>{plan.note}</EmptyNote>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Total buys" value={fmtUsd(plan.totalBuyUsd)} tone="up" />
            <Stat label="Total sells" value={fmtUsd(plan.totalSellUsd)} tone="warn" />
            <Stat
              label="Net USDT"
              value={fmtUsd(plan.netUsdtDeltaUsd)}
              tone={plan.netUsdtDeltaUsd >= 0 ? "up" : "down"}
              sub={plan.netUsdtDeltaUsd >= 0 ? "sells fund the buys" : "needs USDT added"}
            />
          </div>
          <div className="overflow-hidden rounded-md border border-line-soft">
            {plan.legs.map((l) => (
              <div
                key={`${l.token}-${l.side}`}
                className="flex items-center justify-between gap-3 border-b border-line-soft bg-panel-2 px-3 py-2 text-sm last:border-0"
              >
                <span className="flex items-center gap-2">
                  <Badge tone={l.side === "sell" ? "warn" : "genuine"}>{l.side}</Badge>
                  <span className="font-semibold text-ink">{l.ticker}</span>
                </span>
                <span className="num text-ink-soft">{fmtUsd(l.usdtAmount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="mt-3 text-xs leading-relaxed text-ink-faint">
        {plan.note} Threshold {plan.driftThresholdPct} percentage points. Execution is a separate guarded-swap
        step behind the wallet, never run from this dashboard.
      </p>
    </Card>
  )
}
