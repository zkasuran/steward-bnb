import type { NextConfig } from "next"

// Client-driven dashboard: the on-chain reads run in the browser via the SDK, so the app can
// deploy to any static or edge host and stay reachable for judges through the judging window.
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
}

export default config
