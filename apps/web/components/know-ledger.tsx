"use client"

// The True-Position Ledger for one bStock. It reconstructs the position from on-chain transfers,
// surfaces the dividend/split rebase that changed the balance with no transfer (the "you were not
// hacked" moment) and values the live balance from the pool. Cost basis needs a historical price
// feed and says so rather than faking a number.
//
// The Transfer-log scan runs CLIENT-SIDE, in the judge's browser. Free BSC log RPCs serve
// eth_getLogs from a residential IP but reject it from Vercel's cloud IPs, so reading in the
// browser is what makes the ledger and its "you were not hacked" moment work on the live deploy.
// The server route stays in place and is tried only as a secondary attempt, which pays off when the
// host has a keyed logs RPC configured.
import { useCallback, useEffect, useRef, useState } from "react"
import { ShieldCheck, ArrowDownLeft, ArrowUpRight } from "lucide-react"
import { AddrLink, Badge, ErrorNote, KeyVal, Loading, SourceTag, Stat } from "./ui"
import { fmtNum, fmtUsd, fmtTimestamp } from "@/lib/format"
import type { LedgerResponse } from "@/lib/types"
import { buildLedgerInBrowser, type LedgerScan } from "@/lib/ledger-client"

const DEPTHS: { key: string; label: string; scan: LedgerScan; qs: string }[] = [
  { key: "recent", label: "Recent (~16k blocks)", scan: { lookback: 16000 }, qs: "lookback=16000" },
  { key: "day", label: "~1 day (120k)", scan: { lookback: 120000 }, qs: "lookback=120000" },
  { key: "deeper", label: "Deeper (~500k blocks)", scan: { lookback: 500000 }, qs: "lookback=500000" },
  { key: "full", label: "Full history (slow)", scan: { fromBlock: 0 }, qs: "fromBlock=0" },
]

const FAIL_HINT =
  "The browser could not finish this scan against the public BSC log RPC. A smaller scan depth often succeeds, and a keyed logs RPC would remove the limit entirely. Token authenticity and the live balance still read fine in Fine Print above."

export function LedgerView({ address, token, symbol }: { address: string; token: string; symbol: string }) {
  const [data, setData] = useState<LedgerResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [depth, setDepth] = useState(DEPTHS[0])
  // Guards against an older read landing after a newer one (a fast retype or depth flip).
  const seq = useRef(0)

  const load = useCallback(
    async (d: (typeof DEPTHS)[number]) => {
      const id = ++seq.current
      setLoading(true)
      setError(null)
      try {
        // Primary path: reconstruct from Transfer logs in the browser, off the visitor's own IP.
        const res = await buildLedgerInBrowser(address, token, d.scan)
        if (id !== seq.current) return
        setData(res)
      } catch {
        if (id !== seq.current) return
        // Secondary attempt: the server route. It only adds anything when the host has a keyed logs
        // RPC set, since a plain cloud IP is exactly what the browser read works around.
        try {
          const r = await fetch(`/api/know/ledger?address=${address}&token=${token}&${d.qs}`, { cache: "no-store" })
          const json = await r.json()
          if (id !== seq.current) return
          if (!r.ok || (json && typeof json === "object" && "error" in json)) {
            setError(FAIL_HINT)
            setData(null)
          } else {
            setData(json as LedgerResponse)
          }
        } catch {
          if (id !== seq.current) return
          setError(FAIL_HINT)
          setData(null)
        }
      } finally {
        if (id === seq.current) setLoading(false)
      }
    },
    [address, token],
  )

  useEffect(() => {
    load(depth)
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
