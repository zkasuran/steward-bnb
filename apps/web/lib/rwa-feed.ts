// RWA feed reconciliation for the Steward dashboard.
//
// The Binance Web3 RWA endpoints key a token by its on-chain contract ADDRESS, not by symbol. The
// bStock set the feed lists is NOT the same as our on-chain BSTOCKS_CANDIDATES. Reconciled live
// on 2026-09-24 against GET /api/v1/dex/market/rwa/tokens (binanceChainId=56): 46 bStock tokens
// (platformId "bstock"). Of the 7 tickers this dashboard shows, 6 are in the feed at the exact same
// address we hold on chain (NVDAB, TSLAB, MSFTB, GOOGLB, SPYB, QQQB) and 1 is NOT (AAPLB: there is
// no Apple bStock in the feed at all, only the Ondo AAPLon tracks Apple).
//
// This map lets the dashboard resolve the ticker it shows to the feed's own address for the
// reference-price and market-status calls. It also flags when a ticker is simply not covered so it
// can degrade honestly instead of fabricating a price. Addresses are stable, so they are baked here;
// prices, ratios and market state are always fetched live and never stored.
export interface RwaFeedEntry {
  tokenSymbol: string // uppercase, e.g. "NVDAB"
  underlyingTicker: string // uppercase, e.g. "NVDA"
  address: string // lowercase 0x, the feed's own contract address
}

export const RWA_FEED_SNAPSHOT = {
  chainId: 56,
  platformId: "bstock",
  capturedUtc: "2026-09-24",
  count: 46,
  endpoint: "/api/v1/dex/market/rwa/tokens",
} as const

// Reconciliation snapshot: every platformId "bstock" token the live feed listed on BSC, 2026-09-24.
export const RWA_BSTOCK_FEED: RwaFeedEntry[] = [
  { tokenSymbol: "AAOIB", underlyingTicker: "AAOI", address: "0x10343ef7da3301493d7ecb647d68a288c6c1db2f" },
  { tokenSymbol: "AMDB", underlyingTicker: "AMD", address: "0x75fd4cf6f8392e41e70391d60c90c0d5211603a1" },
  { tokenSymbol: "ARMB", underlyingTicker: "ARM", address: "0xd42a79ebb7f527f40faecd196ffb47ad5e8d6f8c" },
  { tokenSymbol: "AVGOB", underlyingTicker: "AVGO", address: "0x76682c454467b3a1150ad8b6a92fc5ee2c21d7ed" },
  { tokenSymbol: "AXTIB", underlyingTicker: "AXTI", address: "0x9bdc8b470dbf89dbcb123587c6f5e49cca3463be" },
  { tokenSymbol: "BABAB", underlyingTicker: "BABA", address: "0x4ef9d3062c7f6eba4aae4990c5036598c6eff4ec" },
  { tokenSymbol: "CBRSB", underlyingTicker: "CBRS", address: "0xe81c6bb0266cd68b4f17278531dd03ea1f12da4e" },
  { tokenSymbol: "COINB", underlyingTicker: "COIN", address: "0x585bde7c54abb5ccd7791f923d6c2187635f3952" },
  { tokenSymbol: "CRCLB", underlyingTicker: "CRCL", address: "0x80f3d493ebce97e343c53d29a137942416b4ffc0" },
  { tokenSymbol: "CRWVB", underlyingTicker: "CRWV", address: "0x33e7317e17838fee56b10fe8d0b9ca6ca3090c95" },
  { tokenSymbol: "DRAMB", underlyingTicker: "DRAM", address: "0x93862d63fd9fd488b1328e9b47717d75e994a84b" },
  { tokenSymbol: "EWYB", underlyingTicker: "EWY", address: "0xbe82f76637dba2c114c41df856c2c51e522e2cb8" },
  { tokenSymbol: "GLWB", underlyingTicker: "GLW", address: "0x740e075cbbea22a082b9d6679e65e82767875b6a" },
  { tokenSymbol: "GOOGLB", underlyingTicker: "GOOGL", address: "0x3f53de71c126bdabae20f9cd64848d317f6c3238" },
  { tokenSymbol: "HOODB", underlyingTicker: "HOOD", address: "0xa394dcea3fd3847fd793afbfd163e2e3858b7c65" },
  { tokenSymbol: "IBMB", underlyingTicker: "IBM", address: "0xfa273b076feb8c0fb34e554ae341082323d016a3" },
  { tokenSymbol: "INTCB", underlyingTicker: "INTC", address: "0xe614e2fc6c787035ff51f452e8e826bfd32d5283" },
  { tokenSymbol: "INTWB", underlyingTicker: "INTW", address: "0x0735d9904b7e34e6fe39b0f66e00c111b3f2b681" },
  { tokenSymbol: "KORUB", underlyingTicker: "KORU", address: "0x1ffad32d69c5fead99f88c25ca0191edc3757636" },
  { tokenSymbol: "LITEB", underlyingTicker: "LITE", address: "0x64748bea17b6d19e242adf20425de2440c656142" },
  { tokenSymbol: "METAB", underlyingTicker: "META", address: "0x7425889fe94f9d693e8daefe88bcced6acfef4c0" },
  { tokenSymbol: "MRVLB", underlyingTicker: "MRVL", address: "0x16cd4fe7e8880ecc3ba222795229e20489fc2c76" },
  { tokenSymbol: "MSFTB", underlyingTicker: "MSFT", address: "0x80106cb3ead06659a5ad19df39d9b4733863b9b0" },
  { tokenSymbol: "MSTRB", underlyingTicker: "MSTR", address: "0xe87afb3076aeb0f9b14e368de8145ae6a2826a14" },
  { tokenSymbol: "MUB", underlyingTicker: "MU", address: "0xcdf2f3e0fa43c47a6662a91c9e4a7c5f69762699" },
  { tokenSymbol: "MUUB", underlyingTicker: "MUU", address: "0x0bb3fa77e0809f42948e435f04883c25415e8263" },
  { tokenSymbol: "MVLLB", underlyingTicker: "MVLL", address: "0x7c26a12f20507e2cee22ceebed9e88fda47f866c" },
  { tokenSymbol: "NBISB", underlyingTicker: "NBIS", address: "0xe256bc2a4f5297f8ba6f043f180a46300ecbcbb1" },
  { tokenSymbol: "NOKB", underlyingTicker: "NOK", address: "0x7c4d7a180d737dd5a70d8065a90e6746a69c37ea" },
  { tokenSymbol: "NVDAB", underlyingTicker: "NVDA", address: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436" },
  { tokenSymbol: "ORCLB", underlyingTicker: "ORCL", address: "0x4684d9887fc1c71cba7bab8e88835cec217eb598" },
  { tokenSymbol: "PLTRB", underlyingTicker: "PLTR", address: "0x0ca5d51d0277bd006fd9607d3e560785ebad8222" },
  { tokenSymbol: "QCOMB", underlyingTicker: "QCOM", address: "0x5f7a56e877b9130608bf8be962621011182fefe1" },
  { tokenSymbol: "QNTB", underlyingTicker: "QNT", address: "0xd721c192d612db77621df57a9fab38418033c02e" },
  { tokenSymbol: "QQQB", underlyingTicker: "QQQ", address: "0x205812cdbed920aff76c6580abd681a46d11efc7" },
  { tokenSymbol: "RKLBB", underlyingTicker: "RKLB", address: "0xc8da12cbcce7c45180692a6420b0076e03a5179a" },
  { tokenSymbol: "SKHYB", underlyingTicker: "SKHY", address: "0xca750ef65f295bbecd685abf54e82caf297bdb61" },
  { tokenSymbol: "SNDKB", underlyingTicker: "SNDK", address: "0x3ee4df61bd4f867e349beae8bfe07bc31b4850fb" },
  { tokenSymbol: "SNXXB", underlyingTicker: "SNXX", address: "0x9e82e3da8f1115b73d24bb24113ab836ffdab6b6" },
  { tokenSymbol: "SOXLB", underlyingTicker: "SOXL", address: "0xd97d097a89113fa59b76c572e5b2eb647e8eefaf" },
  { tokenSymbol: "SPCXB", underlyingTicker: "SPCX", address: "0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1" },
  { tokenSymbol: "SPYB", underlyingTicker: "SPY", address: "0x7138b48df7d98d7e3cc221bfe7192d0a178182d8" },
  { tokenSymbol: "TQQQB", underlyingTicker: "TQQQ", address: "0x462b5f13b7c7748279358962925c5de83bb9e598" },
  { tokenSymbol: "TSLAB", underlyingTicker: "TSLA", address: "0x5b1910eaad6450e50f816082aa078c41f10c292f" },
  { tokenSymbol: "TSMB", underlyingTicker: "TSM", address: "0xab78b89b5bb00236be0b4b20704cbfa04efc711c" },
  { tokenSymbol: "WDCB", underlyingTicker: "WDC", address: "0xebe29695f8047c13d36e7a790ca8c1b239ffad1c" },
]

const byAddress = new Map(RWA_BSTOCK_FEED.map((e) => [e.address.toLowerCase(), e]))
const bySymbol = new Map(RWA_BSTOCK_FEED.map((e) => [e.tokenSymbol.toUpperCase(), e]))
const byUnderlying = new Map(RWA_BSTOCK_FEED.map((e) => [e.underlyingTicker.toUpperCase(), e]))

// Strip our internal suffixes (e.g. the "_disputed" key on QQQB) and normalise case.
function normSymbol(s: string): string {
  return s.trim().toUpperCase().split("_")[0]
}

// Resolve a ticker or address the dashboard shows to the feed's own entry. Address wins when given
// (it is what the feed keys on). Then the on-chain symbol, then the symbol read as an underlying
// (dropping the trailing bStock "B"), then the raw string as an underlying. Returns null when the
// feed simply does not list it, which is the signal to degrade rather than fabricate a price.
export function resolveRwaFeed(input: { address?: string | null; symbol?: string | null }): RwaFeedEntry | null {
  const addr = input.address?.trim().toLowerCase()
  if (addr && byAddress.has(addr)) return byAddress.get(addr) ?? null
  const sym = input.symbol ? normSymbol(input.symbol) : ""
  if (!sym) return null
  if (bySymbol.has(sym)) return bySymbol.get(sym) ?? null
  const asUnderlying = sym.replace(/B$/, "")
  if (byUnderlying.has(asUnderlying)) return byUnderlying.get(asUnderlying) ?? null
  if (byUnderlying.has(sym)) return byUnderlying.get(sym) ?? null
  return null
}

// True when the feed covers this ticker/address, so a caller can branch before spending a call.
export function isCoveredByRwaFeed(input: { address?: string | null; symbol?: string | null }): boolean {
  return resolveRwaFeed(input) !== null
}
