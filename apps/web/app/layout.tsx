import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "Steward — own a tokenized stock on BNB Chain, not just buy one",
  description:
    "The whole life of a tokenized stock holding on BNB Smart Chain: know what you truly own, grow it on convictions, use it safely and compare it across providers. Real mainnet reads, own-side not buy-side.",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e11" },
  ],
}

// Paint the correct theme before first render so there is no flash. Reads the saved choice, then
// falls back to the OS preference, then to dark. Runs synchronously in <head>, ahead of the body.
const THEME_SCRIPT = `(function(){try{var k='steward-theme';var t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
