"use client"

// The True-Position Ledger for one bStock. It reconstructs the position from on-chain transfers,
// surfaces the dividend/split rebase that changed the balance with no transfer (the "you were not
// hacked" moment) and values the live balance from the pool. Cost basis needs a historical price
// feed and says so rather than faking a number.
import { useCallback, useEffect, useState } from "react"
import { ShieldCheck, ArrowDownLeft, ArrowUpRight } from "lucide-react"
import { useEndpoint } from "./use-endpoint"
import { AddrLink, Badge, ErrorNote, KeyVal, Loading, SourceTag, Stat } from "./ui"
import { fmtNum, fmtUsd, fmtTimestamp } from "@/lib/format"
import type { LedgerResponse } from "@/lib/types"

const DEPTHS: { key: string; label: string; qs: string }[] = [
  { key: "recent", label: "Recent (~120k blocks)", qs: "lookback=120000" },
  { key: "deeper", label: "Deeper (~500k blocks)", qs: "lookback=500000" },
  { key: "full", label: "Full history (slow)", qs: "fromBlock=0" },
]

export function LedgerView({ address, token, symbol }: { address: string; token: string; symbol: string }) {
  const { data, error, loading, call } = useEndpoint<LedgerResponse>()
  const [depth, setDepth] = useState(DEPTHS[0])

  const load = useCallback(
    (qs: string) => {
      call(`/api/know/ledger?address=${address}&token=${token}&${qs}`)
    },
    [address, token, call],
  )

  useEffect(() => {
    load(depth.qs)
  }, [load, depth])

  return (
    <div className="mt-3 rounded-md border border-line-soft bg-canvas/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">True-Position Ledger · {symbol}</span>
        <label className="flex items-center gap-2 text-xs text-ink-dim">
          Scan depth
          <select
            value={depth.key}
            onChange={(e) => setDepth(DEPTHS.find((d) => d.key === e.target.value) ?? DEPTHS[0])}
            className="rounded border border-line bg-panel-2 px-2 py-1 text-ink-soft outline-none focus:border-brand"
          >
            {DEPTHS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <Loading label="Reconstructing from Transfer logs…" /> : null}
      {error ? <ErrorNote message={error} /> : null}
      {data ? <LedgerBody data={data} /> : null}
    </div>
  )
}

function LedgerBody({ data }: { data: LedgerResponse }) {
  return (
    <div>
      <SourceTag chainId={data.chainId} atBlock={data.balanceAtBlock} />
      <p className="mt-1 text-xs text-ink-faint">
        Scanned blocks {data.scannedFromBlock.toLocaleString("en-US")} to{" "}
        {data.scannedToBlock.toLocaleString("en-US")} · {data.transferCount} transfers · {data.lotCount} lots
      </p>

      {data.corporateActions.length > 0 ? (
        <div className="mt-3 rounded-md border border-info/40 bg-info/10 p-4">
          <div className="flex items-center gap-2 text-info">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            <span className="text-sm font-semibold">Your balance changed. You were not hacked.</span>
          </div>
          {data.corporateActions.map((c, i) => (
            <p key={i} className="mt-2 text-sm leading-relaxed text-ink-soft">
              {c.explanation}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Live balance" value={fmtNum(Number(data.liveBalanceHuman))} sub={`${data.symbol}, read fresh`} />
        <Stat label="From transfers" value={fmtNum(Number(data.netFromTransfersHuman))} sub="in minus out" />
        <Stat
          label="Rebase credit"
          value={fmtNum(Number(data.dividendRebaseHuman))}
          tone={Number(data.dividendRebaseHuman) > 0 ? "up" : "ink"}
          sub="no transfer, credited on-chain"
        />
        <Stat
          label="Market value"
          value={data.marketValueUsd == null ? "unknown" : fmtUsd(data.marketValueUsd)}
          sub="live pool price"
        />
      </div>

      <div className="mt-3 rounded-md border border-line-soft bg-panel-2 px-4 py-1">
        <KeyVal k="Current price (on-chain pool)" v={data.currentPriceUsd == null ? "unknown" : fmtUsd(data.currentPriceUsd)} />
        <KeyVal k="Cost basis (open lots)" v={data.costBasisUsd == null ? <span className="unknown">unknown</span> : fmtUsd(data.costBasisUsd)} />
        <KeyVal
          k="Unrealized"
          v={
            data.unrealizedPnlUsd == null ? (
              <span className="unknown">unknown</span>
            ) : (
              <span className={data.unrealizedPnlUsd >= 0 ? "text-up" : "text-down"}>{fmtUsd(data.unrealizedPnlUsd)}</span>
            )
          }
        />
        <KeyVal k="Realized" v={data.realizedPnlUsd == null ? <span className="unknown">unknown</span> : fmtUsd(data.realizedPnlUsd)} />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-faint">{data.basisNote}</p>

      {data.transfers.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-dim">
            Transfers (latest {data.transfers.length})
          </div>
          <div className="overflow-hidden rounded-md border border-line-soft">
            {data.transfers.map((t, i) => (
              <div
                key={`${t.txHash}-${i}`}
                className="flex items-center justify-between gap-3 border-b border-line-soft bg-panel-2 px-3 py-2 text-sm last:border-0"
              >
                <span className="flex items-center gap-2">
                  {t.direction === "in" ? (
                    <Badge tone="genuine">
                      <ArrowDownLeft className="h-3 w-3" aria-hidden /> in
                    </Badge>
                  ) : (
                    <Badge tone="warn">
                      <ArrowUpRight className="h-3 w-3" aria-hidden /> out
                    </Badge>
                  )}
                  <span className="num text-ink-soft">{fmtNum(Number(t.unitsHuman))}</span>
                </span>
                <span className="flex items-center gap-3 text-xs text-ink-faint">
                  {t.timestamp ? <span className="num">{fmtTimestamp(t.timestamp)}</span> : null}
                  <AddrLink address={t.txHash} kind="tx" />
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-dim">
          No transfers found in the scanned window. Widen the scan depth to look back further.
        </p>
      )}
    </div>
  )
}
