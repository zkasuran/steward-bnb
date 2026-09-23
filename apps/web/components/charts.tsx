// Inline SVG / CSS charts for Steward. No chart library and no new dependency. Each is a small,
// legible, accessible mark: a role and an aria-label carry the numbers for a screen reader.
import { cn } from "@/lib/cn"
import { fmtWeight, fmtPct } from "@/lib/format"

// Target versus current weight for one basket leg. The fill is the current weight, the tick is
// the target, both as a share of the whole basket (0 to 100%).
export function WeightBar({ targetWeight, currentWeight }: { targetWeight: number; currentWeight: number }) {
  const cur = Math.max(0, Math.min(1, currentWeight))
  const tgt = Math.max(0, Math.min(1, targetWeight))
  const over = currentWeight > targetWeight
  return (
    <div
      className="relative h-3 w-full overflow-hidden rounded-full bg-panel-2"
      role="img"
      aria-label={`current weight ${fmtWeight(currentWeight)}, target ${fmtWeight(targetWeight)}`}
    >
      <div
        className={cn("absolute inset-y-0 left-0 rounded-full", over ? "bg-warn" : "bg-brand")}
        style={{ width: `${cur * 100}%` }}
      />
      <div
        className="absolute inset-y-0 w-0.5 bg-ink"
        style={{ left: `calc(${tgt * 100}% - 1px)` }}
        title={`target ${fmtWeight(targetWeight)}`}
      />
    </div>
  )
}

// Diverging drift bar centred at zero. Left (negative) is underweight, a buy; right (positive)
// is overweight, a sell. Scaled so the largest drift in the set fills the half-track.
export function DriftBar({ driftPct, scaleMax }: { driftPct: number; scaleMax: number }) {
  const max = Math.max(scaleMax, 1)
  const frac = Math.max(-1, Math.min(1, driftPct / max))
  const widthPct = Math.abs(frac) * 50
  const positive = driftPct > 0
  return (
    <div
      className="relative h-3 w-full rounded-full bg-panel-2"
      role="img"
      aria-label={`drift ${fmtPct(driftPct)} ${positive ? "overweight" : "underweight"}`}
    >
      <div className="absolute inset-y-0 left-1/2 w-px bg-line" aria-hidden />
      <div
        className={cn("absolute inset-y-0 rounded-full", positive ? "bg-down" : "bg-info")}
        style={positive ? { left: "50%", width: `${widthPct}%` } : { right: "50%", width: `${widthPct}%` }}
      />
    </div>
  )
}

// Health-factor gauge. Venus liquidates at 1.0, so the zone under 1 is red, 1 to 1.5 amber, above
// safe. The marker sits at the health factor, capped at 4 for the view.
export function HealthMeter({ hf }: { hf: number | null }) {
  if (hf === null) {
    return (
      <div className="rounded-md border border-line-soft bg-panel-2 px-3 py-2 text-sm text-ink-dim">
        No debt, so no liquidation point. Health factor applies once USDT is borrowed.
      </div>
    )
  }
  const cap = 4
  const pos = Math.max(0, Math.min(1, hf / cap)) * 100
  const tone = hf < 1.25 ? "text-down" : hf < 1.5 ? "text-warn" : "text-up"
  return (
    <div role="img" aria-label={`health factor ${hf.toFixed(2)}, liquidation at 1.0`}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-ink-dim">Health factor</span>
        <span className={cn("num text-lg font-semibold", tone)}>{hf.toFixed(2)}</span>
      </div>
      <div className="relative mt-2 h-3 w-full overflow-hidden rounded-full">
        <div className="absolute inset-0 flex">
          <div className="h-full bg-down/70" style={{ width: "25%" }} />
          <div className="h-full bg-warn/70" style={{ width: "12.5%" }} />
          <div className="h-full bg-up/70" style={{ width: "62.5%" }} />
        </div>
        <div
          className="absolute -top-1 h-5 w-0.5 bg-ink"
          style={{ left: `calc(${pos}% - 1px)` }}
          aria-hidden
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-faint">
        <span>0</span>
        <span>1.0 liquidation</span>
        <span>4+</span>
      </div>
    </div>
  )
}
