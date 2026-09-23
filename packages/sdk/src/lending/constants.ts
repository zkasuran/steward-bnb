// Venus (BSC money-market) constants for "Swipe": borrowing USDT against a bStocks position.
//
// This is SPOT collateralised borrowing, NOT a perpetual and NOT margin trading. The holder
// supplies a genuine bStock, keeps it, and draws USDT against it on Venus. No leverage loop is
// opened here and nothing derivative is created; the only position is a plain over-collateralised
// loan that the holder can repay to release the same tokens.
//
// Every address below was re-read from BSC mainnet on 2026-09-23 at block 123,606,899 via
// bsc-rpc.publicnode.com, not copied from a blog. The reader re-reads the governable numbers
// (collateral factor, liquidation threshold, price) live before trusting them, so a stale value
// here is caught rather than believed.
import { parseAbi, type Address } from "viem"

// Venus core-pool Comptroller. Verified 2026-09-23: 1508 bytes of code on chain 56,
// closeFactorMantissa() 0.5e18, getAllMarkets() returns 55 markets. It is a Diamond, so
// getEffectiveLtvFactor and getAccountLiquidity live on facets, not on the plain Unitroller ABI.
export const VENUS_COMPTROLLER: Address = "0xfD36E2c2a6789Db23113685031d7F16329158384"

// Borrow-side market. vUSDT.underlying() re-read 2026-09-23 as canonical BSC-USDT
// 0x55d398326f99059fF775485246999027B3197955, so borrowing this vToken pays out USDT.
export const VUSDT: Address = "0xfD5840Cd36d94D7229439859C0112a4185BC0255"

// A genuine bStock listed as a Venus collateral market. underlying passes the bStocks beacon
// check; collateralFactor (borrow-capacity weight) and liquidationThreshold (liquidation weight)
// are the core-pool values read 2026-09-23. They move on a governance vote, so the reader re-reads
// them per account via getEffectiveLtvFactor and treats these only as a labelled fallback.
export interface BStockVenusMarket {
  symbol: string
  vToken: Address
  underlying: Address
  /** Strategy 0: how much can be borrowed against the collateral. */
  collateralFactor: number
  /** Strategy 1: the weight at which Venus liquidates. Higher than the collateral factor. */
  liquidationThreshold: number
}

// VERIFIED 2026-09-23 on BSC mainnet: these four bStocks are listed Venus core markets with a
// non-zero collateral factor, so they are usable collateral for a USDT borrow today. This is not a
// summary from docs; each row was read from markets() + getEffectiveLtvFactor + the beacon slot.
export const BSTOCK_VENUS_MARKETS: Record<string, BStockVenusMarket> = {
  TSLAB: {
    symbol: "vTSLAB",
    vToken: "0x97421799419Eb782628e73e7220d8E0A207469a3",
    underlying: "0x5b1910eAaD6450E50f816082Aa078C41F10C292f",
    collateralFactor: 0.6,
    liquidationThreshold: 0.7,
  },
  NVDAB: {
    symbol: "vNVDAB",
    vToken: "0xEb8Ca841cBe1BC4832A10b15c7dAB1081eDaD371",
    underlying: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436",
    collateralFactor: 0.6,
    liquidationThreshold: 0.7,
  },
  SPCXB: {
    symbol: "vSPCXB",
    vToken: "0xC36dFaCc7a125859C106F29b9F2d874CCF29A55A",
    underlying: "0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1",
    collateralFactor: 0.5,
    liquidationThreshold: 0.65,
  },
  SKHYB: {
    symbol: "vSKHYB",
    vToken: "0x3E281461efb3D53EC20DB207674373Ed8Ef3BbA9",
    underlying: "0xCA750eF65f295BBECd685Abf54e82CAf297BDB61",
    collateralFactor: 0.5,
    liquidationThreshold: 0.65,
  },
}

// Read ABIs. getEffectiveLtvFactor and getAccountLiquidity are declared from their deployed facet
// selectors because they appear in no published core-pool ABI.
export const COMPTROLLER_ABI = parseAbi([
  "function getAllMarkets() view returns (address[])",
  "function getAssetsIn(address account) view returns (address[])",
  "function markets(address vToken) view returns (bool isListed, uint256 collateralFactorMantissa, bool isVenus)",
  "function getAccountLiquidity(address account) view returns (uint256 err, uint256 liquidity, uint256 shortfall)",
  "function getEffectiveLtvFactor(address account, address vToken, uint8 strategy) view returns (uint256)",
  "function oracle() view returns (address)",
  "function vaiController() view returns (address)",
])

// getAccountSnapshot is three reads in one call, which is what keeps a position read cheap.
export const VTOKEN_ABI = parseAbi([
  "function getAccountSnapshot(address account) view returns (uint256 err, uint256 vTokenBalance, uint256 borrowBalance, uint256 exchangeRateMantissa)",
  "function symbol() view returns (string)",
  "function underlying() view returns (address)",
  "function getCash() view returns (uint256)",
  "function totalBorrows() view returns (uint256)",
])

export const ORACLE_ABI = parseAbi([
  "function getUnderlyingPrice(address vToken) view returns (uint256)",
])

// VAI debt is not a market, so it never shows up in getAssetsIn. It still counts as debt.
export const VAI_CONTROLLER_ABI = parseAbi([
  "function getVAIRepayAmount(address account) view returns (uint256)",
])

export const ERC20_MINIMAL_ABI = parseAbi(["function decimals() view returns (uint8)"])

// Write ABIs, used only to ENCODE unsigned calldata. Nothing in this package signs or sends.
// mint supplies collateral, borrow draws USDT, repayBorrow closes it, enterMarkets flags the
// collateral as backing a loan, exitMarket removes it, approve lets the vToken pull the underlying.
export const VTOKEN_WRITE_ABI = parseAbi([
  "function mint(uint256 mintAmount) returns (uint256)",
  "function borrow(uint256 borrowAmount) returns (uint256)",
  "function repayBorrow(uint256 repayAmount) returns (uint256)",
])

export const COMPTROLLER_WRITE_ABI = parseAbi([
  "function enterMarkets(address[] vTokens) returns (uint256[])",
  "function exitMarket(address vToken) returns (uint256)",
])

export const ERC20_APPROVE_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
])

// getEffectiveLtvFactor strategy selectors. 0 weights by collateral factor (borrow capacity),
// 1 by liquidation threshold (the liquidation question). Never mixed: they land on different
// numbers because Venus carries the two separately on newer markets.
export const WEIGHT_COLLATERAL_FACTOR = 0
export const WEIGHT_LIQUIDATION_THRESHOLD = 1

// Both USD sums Venus keeps are scaled 1e18 whatever the underlying's decimals, because
// getUnderlyingPrice returns 1e(36 - underlyingDecimals) and exchangeRateStored carries the
// matching 1e(18 + underlyingDecimals - 8); the decimals cancel. No health factor here reads them.
export const WAD = 10n ** 18n
