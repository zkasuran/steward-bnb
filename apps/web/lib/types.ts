// Display DTOs shared by the route handlers (which read BSC through @steward/sdk on the
// server) and the client panels that render them. The route handlers do all the bigint work
// and hand the browser plain JS values, so nothing here carries a bigint.

export interface ApiErrorBody {
  error: string
}

// --- KNOW: Fine Print (holdings + authenticity) ---
export interface HoldingDTO {
  ticker: string
  symbol: string
  name: string
  address: string
  genuine: boolean
  decimals: number
  balanceHuman: string
  balanceRaw: string
  totalSupplyHuman: string
  plainWhatYouOwn: string
  // Reference (NAV) price per underlying share, from the Binance RWA feed when the key is set and
  // the feed covers this ticker, else the labelled mock fixture. Null when the live feed does not
  // list the ticker (never fabricated).
  refPrice: number | null
  tokenToShareRatio: number | null
  // Value in share terms: balance * refPrice * tokenToShareRatio. Null when no reference.
  refValue: number | null
  // False when the live RWA feed does not cover this ticker. referenceNote says why.
  referenceAvailable: boolean
  referenceNote: string | null
  refSource: string | null
  refAsOf: number | null
  // On-chain DEX price per token and the value it implies, shown when the reference is unavailable
  // so the holding still carries a number, clearly marked as on-chain and not a reference.
  onchainPrice: number | null
  onchainValue: number | null
}

// "live" once the Web3 API key is set and the reconciled RWA feed is driving the reference,
// "mock" while the keyless fixture stands in. Drives the reference label in the UI.
export type ReferenceMode = "live" | "mock"

export interface HoldingsResponse {
  chainId: number
  atBlock: number
  holder: string
  holdings: HoldingDTO[]
  flagged: HoldingDTO[]
  referenceMode: ReferenceMode
}

// --- KNOW: True-Position Ledger ---
export interface TransferDTO {
  direction: "in" | "out"
  counterparty: string
  unitsHuman: string
  blockNumber: number
  txHash: string
  timestamp?: number
}

export interface CorporateActionDTO {
  kind: string
  unexplainedUnitsHuman: string
  approxPercent: number
  explanation: string
}

export interface LedgerResponse {
  chainId: number
  token: string
  symbol: string
  decimals: number
  genuine: boolean
  holder: string
  scannedFromBlock: number
  scannedToBlock: number
  balanceAtBlock: number
  liveBalanceHuman: string
  netFromTransfersHuman: string
  openUnitsHuman: string
  dividendRebaseHuman: string
  transferCount: number
  transfers: TransferDTO[]
  lotCount: number
  openLotCount: number
  corporateActions: CorporateActionDTO[]
  valued: boolean
  currentPriceUsd: number | null
  marketValueUsd: number | null
  costBasisUsd: number | null
  realizedPnlUsd: number | null
  unrealizedPnlUsd: number | null
  basisNote: string
}

// --- GROW: Conviction baskets ---
export interface BasketSummaryDTO {
  id: string
  name: string
  description: string
  weights: { ticker: string; weight: number }[]
}

export interface BasketLegDTO {
  ticker: string
  token: string
  genuine: boolean
  balanceHuman: string
  units: number
  priceUsd: number | null
  valueUsd: number
  targetWeight: number
  currentWeight: number
  driftPct: number
}

export interface RebalanceLegDTO {
  ticker: string
  token: string
  side: "buy" | "sell"
  usdtAmount: number
  currentWeight: number
  targetWeight: number
  driftPct: number
}

export interface AnalyzeResponse {
  chainId: number
  basketId: string
  name: string
  holder: string
  atBlock: number | null
  portfolioValueUsd: number
  complete: boolean
  legs: BasketLegDTO[]
  plan: {
    driftThresholdPct: number
    legs: RebalanceLegDTO[]
    totalBuyUsd: number
    totalSellUsd: number
    netUsdtDeltaUsd: number
    gated: boolean
    note: string
  }
}

// --- USE: Guard ---
export interface GuardResponse {
  chainId: number
  action: "allow" | "warn" | "resize" | "block"
  reasons: string[]
  token: string
  symbol: string | null
  usdtIn: number
  atBlock: number | null
  referenceMode: ReferenceMode
  authenticity: { genuine: boolean; method: string }
  premium: {
    spotUsdtPerToken: number
    referencePrice: number
    tokenToShareRatio: number
    fairUsdtPerToken: number
    premiumPct: number
    source?: string
    asOf?: number
  } | null
  premiumError?: string
  depth: {
    slippagePct: number
    priceMovePct: number
    tokensOut: number
    executionPrice: number
    spotPrice: number
    feePaidUsdt: number
    feePpm: number
    reliable: boolean
    note: string
    suggestedUsdtIn?: number
    pool: string
  } | null
  depthError?: string
  marketHours: { isOpen: boolean; weekday: string; etTime: string; reason: string } | null
  thresholds: {
    premiumWarnPct: number
    premiumBlockPct: number
    slippageWarnPct: number
    slippageResizePct: number
  }
}

// --- USE: Swipe (Venus) ---
export interface SwipeResponse {
  chainId: number
  market: {
    symbol: string
    vToken: string
    underlying: string
    genuineBStock: boolean
    isListed: boolean
    collateralFactor: number
    liquidationThreshold: number
    priceUsd: number
    atBlock: number
  }
  collateralUnits: number
  collateralValueUsd: number
  existingUsdtBorrowUsd: number
  availableUsdtLiquidityUsd: number
  plan: {
    weightedCollateralUsd: number
    borrowLimitUsd: number
    targetHealthFactor: number
    maxSafeBorrowUsd: number
    healthFactorAtMaxSafeBorrow: number | null
    bound: string
  }
  fundableBorrowUsd: number
}

// --- Cross-Provider ---
export interface RepresentationDTO {
  family: string
  address: string
  name: string | null
  symbol: string | null
  authentic: boolean
  authenticity: string
  spotUsdt: number | null
  pool: string | null
  poolUsdtReserve: number | null
  atBlock: number | null
  tradeable: boolean
  depth: string
  liquidityNote: string
  provenance: string
}

export interface CompareResponse {
  chainId: number
  underlying: string
  arbitrageExecutable: false
  honesty: string
  representations: RepresentationDTO[]
}
