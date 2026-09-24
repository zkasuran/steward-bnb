"use client"

// USE / Guard: the pre-trade gate. Pick a token and a USDT size, get one verdict with plain
// reasons. Authenticity is on-chain, depth and slippage are from the pool, the reference price is
// the live Binance RWA feed when the key is set and the labelled mock otherwise.
import { useState } from "react"
import { CheckCircle2, AlertTriangle, Scale, ShieldX, ShieldCheck } from "lucide-react"
import { useEndpoint } from "./use-endpoint"
import { AddrLink, Badge, Card, CardTitle, ErrorNote, KeyVal, Loading, LiveTag, MockTag, SourceTag } from "./ui"
import { KNOWN_BSTOCKS, SCAM_CLONE } from "@/lib/known"
import { fmtUsd, fmtPct, fmtNum } from "@/lib/format"
import type { GuardResponse } from "@/lib/types"

const OPTIONS = [...KNOWN_BSTOCKS, SCAM_CLONE]

const VERDICT: Record<GuardResponse["action"], { tone: "genuine" | "warn" | "info" | "scam"; label: string; Icon: typeof CheckCircle2 }> = {
  allow: { tone: "genuine", label: "Allow", Icon: CheckCircle2 },
  warn: { tone: "warn", label: "Warn", Icon: AlertTriangle },
  resize: { tone: "info", label: "Resize", Icon: Scale },
  block: { tone: "scam", label: "Block", Icon: ShieldX },
}

export function GuardCard() {
  const { data, error, loading, call } = useEndpoint<GuardResponse>()
  const [token, setToken] = useState(OPTIONS[0].address)
  const [usdtIn, setUsdtIn] = useState("100")

  const assess = () => call(`/api/use/guard?token=${token}&usdtIn=${encodeURIComponent(usdtIn)}`)

  return (
    <Card>
      <CardTitle
        title="Guard"
        eyebrow="Use · Guard a buy"
        icon={<ShieldCheck className="h-5 w-5" />}
        sub="A pre-trade gate. It checks the token is genuine, the price against the reference, the pool depth for your size and whether the US market is open, then says allow, warn, resize or block with reasons in plain English."
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1">
          <span className="mb-1.5 block text-sm text-ink-soft">Token</span>
          <select
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          >
            {OPTIONS.map((o) => (
              <option key={o.address} value={o.address}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="w-32">
          <span className="mb-1.5 block text-sm text-ink-soft">USDT size</span>
          <input
            value={usdtIn}
            inputMode="decimal"
            onChange={(e) => setUsdtIn(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && assess()}
            className="num w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <button
          type="button"
          onClick={assess}
          className="rounded-md border border-brand bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-dim"
        >
          Assess trade
        </button>
      </div>

      {loading ? <Loading /> : null}
      {error ? (
        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
      ) : null}
      {data ? <GuardVerdict data={data} /> : null}
    </Card>
  )
}

function GuardVerdict({ data }: { data: GuardResponse }) {
  const v = VERDICT[data.action]
  return (
    <div className="rise mt-4">
      <div className={`flex items-center gap-3 rounded-lg border p-4 ${toneBox(v.tone)}`}>
        <v.Icon className="h-6 w-6 shrink-0" aria-hidden />
        <div>
          <div className="text-base font-semibold">{v.label}</div>
          <div className="text-xs opacity-80">
            {data.symbol ?? "token"} · {fmtUsd(data.usdtIn)} buy
          </div>
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {data.reasons.map((r, i) => (
          <li key={i} className="rounded-md border border-line-soft bg-panel-2 px-3 py-2 text-sm text-ink-soft">
            {r}
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-line-soft bg-panel-2 px-4 py-1">
          <div className="py-2 text-xs font-semibold uppercase tracking-wider text-ink-dim">Authenticity</div>
          <KeyVal
            k="Genuine bStock"
            v={
              data.authenticity.genuine ? (
                <Badge tone="genuine">verified by beacon</Badge>
              ) : (
                <Badge tone="scam">failed beacon check</Badge>
              )
            }
            mono={false}
          />
          <KeyVal k="Method" v={data.authenticity.method} mono={false} />
          <KeyVal k="Token" v={<AddrLink address={data.token} kind="token" />} mono={false} />
        </div>

        <div className="rounded-md border border-line-soft bg-panel-2 px-4 py-1">
          <div className="flex items-center justify-between py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Premium to reference</span>
            {data.referenceMode === "live" ? (
              <LiveTag source={data.premium?.source} asOf={data.premium?.asOf} />
            ) : (
              <MockTag />
            )}
          </div>
          {data.premium ? (
            <>
              <KeyVal k="On-chain spot" v={fmtUsd(data.premium.spotUsdtPerToken)} />
              <KeyVal
                k={data.referenceMode === "live" ? "Reference (live)" : "Reference (mock)"}
                v={fmtUsd(data.premium.referencePrice)}
              />
              <KeyVal k="Fair per token" v={fmtUsd(data.premium.fairUsdtPerToken)} />
              <KeyVal
                k="Premium"
                v={<span className={data.premium.premiumPct > 0 ? "text-warn" : "text-up"}>{fmtPct(data.premium.premiumPct)}</span>}
              />
            </>
          ) : (
            <p className="py-2 text-sm text-ink-dim">{data.premiumError ?? "Premium check did not run."}</p>
          )}
        </div>

        <div className="rounded-md border border-line-soft bg-panel-2 px-4 py-1">
          <div className="py-2 text-xs font-semibold uppercase tracking-wider text-ink-dim">Depth and slippage</div>
          {data.depth ? (
            <>
              <KeyVal k="Est. tokens out" v={fmtNum(data.depth.tokensOut)} />
              <KeyVal
                k="All-in slippage"
                v={<span className={data.depth.slippagePct >= data.thresholds.slippageWarnPct ? "text-warn" : "text-up"}>{fmtPct(data.depth.slippagePct)}</span>}
              />
              <KeyVal k="Pool fee" v={`${(data.depth.feePpm / 10000).toFixed(2)}%`} />
              <KeyVal k="Reliable" v={data.depth.reliable ? "yes" : "no, treat as a floor"} mono={false} />
              {data.depth.suggestedUsdtIn != null ? (
                <KeyVal k="Suggested size" v={<span className="text-info">{fmtUsd(data.depth.suggestedUsdtIn)}</span>} />
              ) : null}
              <KeyVal k="Pool" v={<AddrLink address={data.depth.pool} kind="address" />} mono={false} />
            </>
          ) : (
            <p className="py-2 text-sm text-ink-dim">{data.depthError ?? "No pool read."}</p>
          )}
        </div>

        <div className="rounded-md border border-line-soft bg-panel-2 px-4 py-1">
          <div className="py-2 text-xs font-semibold uppercase tracking-wider text-ink-dim">US market hours</div>
          {data.marketHours ? (
            <>
              <KeyVal
                k="Status"
                v={data.marketHours.isOpen ? <Badge tone="genuine">open</Badge> : <Badge tone="warn">closed</Badge>}
                mono={false}
              />
              <KeyVal k="Eastern time" v={`${data.marketHours.etTime} ${data.marketHours.weekday}`} />
              <p className="pb-2 pt-1 text-xs leading-relaxed text-ink-faint">{data.marketHours.reason}</p>
            </>
          ) : (
            <p className="py-2 text-sm text-ink-dim">Market hours unavailable.</p>
          )}
        </div>
      </div>
      <div className="mt-3">
        <SourceTag chainId={data.chainId} atBlock={data.atBlock} />
      </div>
    </div>
  )
}

function toneBox(tone: "genuine" | "warn" | "info" | "scam"): string {
  return tone === "genuine"
    ? "border-up/40 bg-up/10 text-up"
    : tone === "warn"
      ? "border-warn/40 bg-warn/10 text-warn"
      : tone === "info"
        ? "border-info/40 bg-info/10 text-info"
        : "border-down/40 bg-down/10 text-down"
}
