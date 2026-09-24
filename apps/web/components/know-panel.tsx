"use client"

// KNOW: the truth about a holding. Fine Print reads every known bStock plus a scam clone and
// labels each with an authenticity badge and a plain "what you own" line. Each genuine holding
// opens its True-Position Ledger, which carries the corporate-action explainer.
import { useState } from "react"
import { ShieldCheck, ShieldAlert, ScrollText, FileText } from "lucide-react"
import { useEndpoint } from "./use-endpoint"
import { AddressField } from "./address-field"
import { LedgerView } from "./know-ledger"
import { AddrLink, Badge, Card, CardTitle, EmptyNote, ErrorNote, Loading, MockTag, SourceTag } from "./ui"
import { fmtNum, fmtUsd } from "@/lib/format"
import { cn } from "@/lib/cn"
import type { HoldingDTO, HoldingsResponse } from "@/lib/types"

export function KnowPanel({ address, setAddress }: { address: string; setAddress: (v: string) => void }) {
  const { data, error, loading, call } = useEndpoint<HoldingsResponse>()
  const load = () => call(`/api/know/holdings?address=${address.trim()}`)

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardTitle
          title="Fine Print"
          eyebrow="Know"
          icon={<FileText className="h-5 w-5" />}
          sub="Enter a wallet. Steward resolves every token by its on-chain beacon, never by symbol, so a scam look-alike cannot pass as the real thing. You see what you actually own in plain English."
        />
        <AddressField value={address} onChange={setAddress} onSubmit={load} cta="Load holdings" />
      </Card>

      {loading ? (
        <Card>
          <Loading />
        </Card>
      ) : null}
      {error ? (
        <Card>
          <ErrorNote message={error} />
        </Card>
      ) : null}

      {data ? <Holdings data={data} address={address.trim()} /> : null}
    </div>
  )
}

function Holdings({ data, address }: { data: HoldingsResponse; address: string }) {
  const held = data.holdings.filter((h) => Number(h.balanceHuman) > 0)
  return (
    <Card className="rise">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-ink-soft">
          Holder <AddrLink address={data.holder} />
        </div>
        <div className="flex items-center gap-2">
          <MockTag what="value" />
          <SourceTag chainId={data.chainId} atBlock={data.atBlock} />
        </div>
      </div>

      {held.length === 0 ? (
        <EmptyNote>
          No genuine bStocks balance at this address across the known set. The authenticity check still
          ran on every token below, which is the point: ownership is proven on-chain, not assumed.
        </EmptyNote>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {data.holdings.map((h) => (
          <HoldingCard key={h.address} h={h} address={address} />
        ))}
      </div>

      {data.flagged.length > 0 ? (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldAlert className="h-4 w-4 text-down" aria-hidden />
            Flagged: not a genuine bStocks token
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {data.flagged.map((h) => (
              <HoldingCard key={h.address} h={h} address={address} />
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  )
}

function HoldingCard({ h, address }: { h: HoldingDTO; address: string }) {
  const [open, setOpen] = useState(false)
  const hasBalance = Number(h.balanceHuman) > 0
  return (
    <div
      className={cn(
        "rise rounded-lg border bg-panel-2 p-4 transition-colors",
        h.genuine ? "border-up/25 hover:border-up/40" : "border-down/25 hover:border-down/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-ink">{h.ticker}</span>
            <span className="text-xs text-ink-faint">{h.symbol}</span>
          </div>
          <div className="mt-0.5 text-xs text-ink-dim">{h.name}</div>
        </div>
        {h.genuine ? (
          <Badge tone="genuine">
            <ShieldCheck className="h-3 w-3" aria-hidden /> genuine
          </Badge>
        ) : (
          <Badge tone="scam">
            <ShieldAlert className="h-3 w-3" aria-hidden /> scam clone
          </Badge>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="num text-2xl font-semibold text-ink">{fmtNum(Number(h.balanceHuman))}</span>
        {h.genuine && h.refValueMock != null ? (
          <span className="num text-sm text-ink-dim">{fmtUsd(h.refValueMock)}</span>
        ) : null}
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{h.plainWhatYouOwn}</p>

      <div className="mt-3 flex items-center justify-between text-xs">
        <AddrLink address={h.address} kind="token" />
        {h.genuine ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-ink-dim hover:border-brand hover:text-brand"
            aria-expanded={open}
          >
            <ScrollText className="h-3 w-3" aria-hidden />
            {open ? "Hide ledger" : hasBalance ? "Reconstruct ledger" : "Check history"}
          </button>
        ) : null}
      </div>

      {open && h.genuine ? <LedgerView address={address} token={h.address} symbol={h.ticker} /> : null}
    </div>
  )
}
