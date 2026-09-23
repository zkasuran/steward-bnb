"use client"

// USE / Swipe: borrow USDT against a bStock on Venus without selling it. SPOT collateralised
// borrowing, not a perp and not margin. Every number is a live Venus read. The quote is the
// largest safe borrow at a target health factor, capped by the pool's available USDT.
import { useState } from "react"
import { HandCoins } from "lucide-react"
import { useEndpoint } from "./use-endpoint"
import { HealthMeter } from "./charts"
import { AddrLink, Badge, Card, CardTitle, ErrorNote, KeyVal, Loading, SourceTag, Stat } from "./ui"
import { VENUS_MARKETS } from "@/lib/known"
import { fmtUsd, fmtPct, fmtNum } from "@/lib/format"
import type { SwipeResponse } from "@/lib/types"

export function SwipeCard() {
  const { data, error, loading, call } = useEndpoint<SwipeResponse>()
  const [market, setMarket] = useState(VENUS_MARKETS[0].key)
  const [units, setUnits] = useState("10")
  const [hf, setHf] = useState("2")

  const quote = () =>
    call(`/api/use/swipe?market=${market}&units=${encodeURIComponent(units)}&hf=${encodeURIComponent(hf)}`)

  return (
    <Card>
      <CardTitle
        title="Swipe"
        icon={<HandCoins className="h-5 w-5" />}
        sub="Spend against a holding without selling it. Supply a bStock as collateral on Venus and draw USDT. This is spot collateralised borrowing, not a perp and not margin: you keep the stock and repay to release it."
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-40">
          <span className="mb-1.5 block text-sm text-ink-soft">Collateral market</span>
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          >
            {VENUS_MARKETS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="w-28">
          <span className="mb-1.5 block text-sm text-ink-soft">Units</span>
          <input
            value={units}
            inputMode="decimal"
            onChange={(e) => setUnits(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && quote()}
            className="num w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="w-28">
          <span className="mb-1.5 block text-sm text-ink-soft">Target HF</span>
          <input
            value={hf}
            inputMode="decimal"
            onChange={(e) => setHf(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && quote()}
            className="num w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <button
          type="button"
          onClick={quote}
          className="rounded-md border border-brand bg-brand px-4 py-2 text-sm font-medium text-canvas hover:bg-brand-dim"
        >
          Quote borrow
        </button>
      </div>

      {loading ? <Loading label="Reading the Venus market…" /> : null}
      {error ? (
        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
      ) : null}
      {data ? <SwipeQuote data={data} /> : null}
    </Card>
  )
}

function SwipeQuote({ data }: { data: SwipeResponse }) {
  const m = data.market
  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm text-ink-soft">
          {m.symbol}
          {m.genuineBStock ? <Badge tone="genuine">genuine bStock</Badge> : <Badge tone="scam">not genuine</Badge>}
          {m.isListed ? <Badge tone="info">listed on Venus</Badge> : <Badge tone="warn">not listed</Badge>}
        </span>
        <SourceTag chainId={data.chainId} atBlock={m.atBlock} />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Collateral value" value={fmtUsd(data.collateralValueUsd)} sub={`${fmtNum(data.collateralUnits)} units`} />
        <Stat label="Max safe borrow" value={fmtUsd(data.plan.maxSafeBorrowUsd)} tone="up" sub={`at HF ${data.plan.targetHealthFactor}`} />
        <Stat label="Fundable now" value={fmtUsd(data.fundableBorrowUsd)} sub="capped by pool USDT" />
        <Stat label="Borrow cap" value={fmtUsd(data.plan.borrowLimitUsd)} sub="protocol collateral factor" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-line-soft bg-panel-2 p-4">
          <HealthMeter hf={data.plan.healthFactorAtMaxSafeBorrow} />
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            After borrowing the max safe amount, this is where the position sits. Venus liquidates at 1.0.
            The bound was {data.plan.bound.replace(/-/g, " ")}.
          </p>
        </div>
        <div className="rounded-md border border-line-soft bg-panel-2 px-4 py-1">
          <KeyVal k="Underlying" v={<AddrLink address={m.underlying} kind="token" />} mono={false} />
          <KeyVal k="vToken" v={<AddrLink address={m.vToken} kind="address" />} mono={false} />
          <KeyVal k="Oracle price" v={fmtUsd(m.priceUsd)} />
          <KeyVal k="Collateral factor" v={fmtPct(m.collateralFactor * 100)} />
          <KeyVal k="Liquidation threshold" v={fmtPct(m.liquidationThreshold * 100)} />
          <KeyVal k="Pool USDT available" v={fmtUsd(data.availableUsdtLiquidityUsd)} />
          <KeyVal k="Existing USDT debt" v={fmtUsd(data.existingUsdtBorrowUsd)} />
        </div>
      </div>
    </div>
  )
}
