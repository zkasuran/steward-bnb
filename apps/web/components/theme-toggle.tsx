"use client"

// The visible theme control. It flips document.documentElement.dataset.theme between light and
// dark and persists the choice to localStorage under "steward-theme", the same key the no-flash
// script in layout.tsx reads before first paint. It initialises from whatever that script already
// set on <html>, so the button always agrees with what is on screen.
import { useEffect, useState } from "react"
import { Sun, Moon } from "lucide-react"
import { cn } from "@/lib/cn"

type Theme = "light" | "dark"
const KEY = "steward-theme"

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark")
  const [mounted, setMounted] = useState(false)

  // Read the value the no-flash script already applied to <html> so button and page agree.
  useEffect(() => {
    setMounted(true)
    const t = document.documentElement.dataset.theme
    if (t === "light" || t === "dark") setTheme(t)
  }, [])

  const next: Theme = theme === "dark" ? "light" : "dark"

  const flip = () => {
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // A locked-down browser can refuse storage; the in-session flip still works.
    }
    setTheme(next)
  }

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel text-ink-soft transition duration-200 hover:border-brand hover:text-brand hover:shadow-[var(--shadow-1)]",
        className,
      )}
    >
      {/* Empty until mounted so server and first client render match, then the real icon. */}
      {mounted ? (
        theme === "dark" ? (
          <Moon className="h-4.5 w-4.5" aria-hidden />
        ) : (
          <Sun className="h-4.5 w-4.5" aria-hidden />
        )
      ) : (
        <span className="h-4.5 w-4.5" aria-hidden />
      )}
    </button>
  )
}
