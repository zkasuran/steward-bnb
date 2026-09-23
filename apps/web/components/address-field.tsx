"use client"

// A shared address input for KNOW and GROW. Local basic validation only enables the button; the
// server does the real checksum. An example chip fills zkasuran's public EOA so a judge sees the
// flow without hunting for an address.
import { Search } from "lucide-react"
import { cn } from "@/lib/cn"
import { EXAMPLE_HOLDER } from "@/lib/known"
import { shortAddr } from "@/lib/format"

const looksLikeAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a.trim())

export function AddressField({
  value,
  onChange,
  onSubmit,
  label = "Holder address",
  cta = "Load",
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  label?: string
  cta?: string
}) {
  const valid = looksLikeAddress(value)
  return (
    <div>
      <label htmlFor="holder" className="mb-1.5 block text-sm text-ink-soft">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input
            id="holder"
            value={value}
            spellCheck={false}
            autoComplete="off"
            placeholder="0x… a BSC wallet that holds tokenized stocks"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) onSubmit()
            }}
            className="num w-full rounded-md border border-line bg-panel-2 py-2 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-brand"
          />
        </div>
        <button
          type="button"
          disabled={!valid}
          onClick={onSubmit}
          className={cn(
            "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
            valid
              ? "border-brand bg-brand text-canvas hover:bg-brand-dim"
              : "cursor-not-allowed border-line bg-panel-2 text-ink-faint",
          )}
        >
          {cta}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-ink-faint">
        <span>Example:</span>
        <button
          type="button"
          onClick={() => onChange(EXAMPLE_HOLDER)}
          className="num rounded border border-line px-2 py-0.5 text-ink-dim hover:border-brand hover:text-brand"
        >
          {shortAddr(EXAMPLE_HOLDER)}
        </button>
        {!valid && value.length > 0 ? <span className="text-warn">Not a 0x address yet</span> : null}
      </div>
    </div>
  )
}
