// Public, verified BSC addresses the client needs for dropdowns and examples. Addresses only,
// never a key. These mirror the SDK constants (which re-verify each one by beacon at read time),
// kept here so the client bundle does not import the SDK and viem just to fill a select.

export interface KnownToken {
  ticker: string
  label: string
  address: string
}

// Genuine bStocks candidates. The server still beacon-checks each one; a wrong entry is caught,
// not trusted.
export const KNOWN_BSTOCKS: KnownToken[] = [
  { ticker: "AAPLB", label: "AAPLB · Apple", address: "0x431a3BEE82E2ca41e49895CbECE5bB0F76A89b7A" },
  { ticker: "NVDAB", label: "NVDAB · Nvidia", address: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436" },
  { ticker: "TSLAB", label: "TSLAB · Tesla", address: "0x5b1910eAaD6450E50f816082Aa078C41F10C292f" },
  { ticker: "MSFTB", label: "MSFTB · Microsoft", address: "0x80106cb3EAD06659A5ad19DF39D9b4733863B9b0" },
  { ticker: "GOOGLB", label: "GOOGLB · Alphabet", address: "0x3F53De71c126BdaBAe20f9cD64848d317f6C3238" },
  { ticker: "SPYB", label: "SPYB · S&P 500", address: "0x7138b48df7D98D7e3cc221BfE7192D0a178182D8" },
  { ticker: "QQQB", label: "QQQB · Nasdaq 100", address: "0x205812CdBed920aFf76C6580abD681a46D11efc7" },
]

// A known scam look-alike. Guard must BLOCK it. Offered as an example so the block is visible.
export const SCAM_CLONE = {
  ticker: "CLONE",
  label: "Known scam clone (must block)",
  address: "0x244B112Cf746e62A5DF723cbDe9906a6dEfd7777",
}

// The bStocks listed as Venus collateral markets, for the Swipe borrow quote.
export const VENUS_MARKETS: { key: string; label: string }[] = [
  { key: "TSLAB", label: "TSLAB · Tesla" },
  { key: "NVDAB", label: "NVDAB · Nvidia" },
  { key: "SPCXB", label: "SPCXB · SpaceX" },
  { key: "SKHYB", label: "SKHYB · SK Hynix" },
]

// A public example holder address (zkasuran's EOA). Public address only, never the key.
export const EXAMPLE_HOLDER = "0xDB6c6340342e71A63cD11Ebac2185204b7777777"
