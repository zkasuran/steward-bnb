"use client"

// Steward: the non-crypto-native front door to OWNING a tokenized stock on BNB Chain, not just
// buying one. Four tabs over the whole life of a holding: KNOW the truth, GROW on convictions,
// USE it safely and COMPARE it across providers. Every panel reads BSC mainnet through server
// route handlers, so the browser never touches an RPC. The address is shared by KNOW and GROW.
import { useState } from "react"
import { Eye, Sprout, Wallet, GitCompareArrows } from "lucide-react"
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
    <main className="mx-auto min-h-screen max-w-5xl px-4 pb-20 pt-8 md:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm bg-brand" aria-hidden />
          <span className="text-2xl font-semibold tracking-tight text-ink">Steward</span>
          <span className="rounded-md border border-line px-2 py-0.5 text-xs text-ink-dim">BNB Smart Chain</span>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Every other tool helps you buy a tokenized stock. Steward is the whole life of the holding: know
          what you truly own, grow it on your convictions and use it, all on real BSC mainnet reads. Own-side,
          not buy-side.
        </p>
      </header>

      <nav className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Sections">
        {TABS.map((t) => {
          const active = t.key === tab
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                active ? "border-brand bg-brand/10" : "border-line bg-panel hover:border-line-soft",
              )}
            >
              <t.Icon className={cn("mt-0.5 h-5 w-5 shrink-0", active ? "text-brand" : "text-ink-dim")} aria-hidden />
              <span>
                <span className={cn("block text-sm font-semibold", active ? "text-ink" : "text-ink-soft")}>{t.label}</span>
                <span className="block text-xs text-ink-faint">{t.hint}</span>
              </span>
            </button>
          )
        })}
      </nav>

      {tab === "know" ? <KnowPanel address={address} setAddress={setAddress} /> : null}
      {tab === "grow" ? <GrowPanel address={address} setAddress={setAddress} /> : null}
      {tab === "use" ? <UsePanel /> : null}
      {tab === "compare" ? <ComparePanel /> : null}

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
