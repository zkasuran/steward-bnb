"use client"

// Steward: the non-crypto-native front door to OWNING a tokenized stock on BNB Chain, not just
// buying one. Four tabs over the whole life of a holding: KNOW the truth, GROW on convictions,
// USE it safely and COMPARE it across providers. Every panel reads BSC mainnet through server
// route handlers, so the browser never touches an RPC. The address is shared by KNOW and GROW.
import { useState } from "react"
import { Eye, Sprout, Wallet, GitCompareArrows } from "lucide-react"
import { Hero } from "@/components/hero"
import { KnowPanel } from "@/components/know-panel"
import { GrowPanel } from "@/components/grow-panel"
import { UsePanel } from "@/components/use-panel"
import { ComparePanel } from "@/components/compare-panel"
import { cn } from "@/lib/cn"

type TabKey = "know" | "grow" | "use" | "compare"

const TABS: { key: TabKey; label: string; hint: string; Icon: typeof Eye }[] = [
  { key: "know", label: "Know", hint: "What you truly own", Icon: Eye },
  { key: "grow", label: "Grow", hint: "Convictions and rebalancing", Icon: Sprout },
  { key: "use", label: "Use", hint: "Guard a buy, borrow safely", Icon: Wallet },
  { key: "compare", label: "Compare", hint: "bStocks vs Ondo vs xStocks", Icon: GitCompareArrows },
]

export default function Home() {
  const [tab, setTab] = useState<TabKey>("know")
  const [address, setAddress] = useState("")

  return (
    <main className="mx-auto min-h-screen max-w-5xl overflow-x-clip px-4 pb-20 pt-6 md:px-6">
      <Hero />

      <nav className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="Sections">
        {TABS.map((t) => {
          const active = t.key === tab
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-start gap-2.5 rounded-lg border p-3.5 text-left transition duration-200",
                active
                  ? "border-brand bg-brand/10 shadow-[var(--shadow-1)]"
                  : "border-line bg-panel hover:-translate-y-0.5 hover:shadow-[var(--shadow-1)]",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                  active
                    ? "border-brand/40 bg-brand/15 text-brand"
                    : "border-line-soft bg-panel-2 text-ink-dim group-hover:text-ink-soft",
                )}
              >
                <t.Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", active ? "text-ink" : "text-ink-soft")}>
                  {t.label}
                </span>
                <span className="block text-xs text-ink-faint">{t.hint}</span>
              </span>
            </button>
          )
        })}
      </nav>

      {/* Keyed by tab so switching sections replays the .rise entrance. */}
      <div key={tab} className="rise">
        {tab === "know" ? <KnowPanel address={address} setAddress={setAddress} /> : null}
        {tab === "grow" ? <GrowPanel address={address} setAddress={setAddress} /> : null}
        {tab === "use" ? <UsePanel /> : null}
        {tab === "compare" ? <ComparePanel /> : null}
      </div>

      <footer className="mt-12 border-t border-line pt-6 text-xs leading-relaxed text-ink-faint">
        <p>
          Reads only. Nothing here signs, sends or spends. Rebalance and borrow are plan-only quotes; execution
          is a separate guarded step behind a wallet. Reference price and value are a keyless mock until the
          Web3 API key is wired. Every mock value is labelled.
        </p>
        <p className="mt-2">
          Not affiliated with, endorsed by or partnered with BNB Chain or Binance. Spot only, no perps. Source
          available under LicenseRef-zkasuran-SAND-1.0. AI assistance was used in building this; the design and
          verification are the author&apos;s.
        </p>
      </footer>
    </main>
  )
}
