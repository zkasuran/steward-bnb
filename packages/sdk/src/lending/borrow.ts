// Unsigned transaction BUILDERS for the "Swipe" flow: supply a bStock, flag it as collateral, and
// borrow USDT against it. SPOT collateralised borrowing, NOT a perp and NOT margin. Everything here
// only ENCODES calldata and returns a { to, data, value } request. Nothing signs, nothing sends, and
// there is no key anywhere in this package: execution needs gas and is a gated human step.
import { encodeFunctionData, getAddress, type Address, type Hex } from "viem"
import {
  VENUS_COMPTROLLER,
  VUSDT,
  BSTOCK_VENUS_MARKETS,
  VTOKEN_WRITE_ABI,
  COMPTROLLER_WRITE_ABI,
  ERC20_APPROVE_ABI,
} from "./constants.js"

// The shape an EOA or a smart-wallet relay needs to submit. `value` is always 0n here: bStock
// vTokens are ERC20 markets, not the native vBNB market, so no BNB rides along with these calls.
export interface TxRequest {
  to: Address
  data: Hex
  value: bigint
}

export interface LabeledTx extends TxRequest {
  label: string
  note: string
}

/** Resolve a market ref to its vToken + underlying from the pinned table, or accept raw addresses. */
function resolveMarket(ref: string, underlying?: Address): { vToken: Address; underlying: Address } {
  const known = BSTOCK_VENUS_MARKETS[ref.toUpperCase()]
  if (known) return { vToken: known.vToken, underlying: known.underlying }
  const vToken = getAddress(ref)
  for (const m of Object.values(BSTOCK_VENUS_MARKETS)) {
    if (vToken.toLowerCase() === m.vToken.toLowerCase()) return { vToken: m.vToken, underlying: m.underlying }
  }
  if (underlying === undefined) {
    throw new Error(`unknown market ref ${ref}: pass the underlying address so approve can be built`)
  }
  return { vToken, underlying: getAddress(underlying) }
}

/**
 * ERC20 approve so a vToken may pull the underlying bStock during mint. Sent to the underlying
 * token, spender is the vToken. Approve the exact supply amount rather than an unbounded allowance.
 */
export function buildApproveTx(underlying: Address, vToken: Address, amount: bigint): TxRequest {
  return {
    to: getAddress(underlying),
    data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: "approve", args: [getAddress(vToken), amount] }),
    value: 0n,
  }
}

/** Supply the bStock as collateral: mint vTokens. Sent to the collateral vToken. */
export function buildSupplyTx(vToken: Address, amount: bigint): TxRequest {
  return {
    to: getAddress(vToken),
    data: encodeFunctionData({ abi: VTOKEN_WRITE_ABI, functionName: "mint", args: [amount] }),
    value: 0n,
  }
}

/** Flag supplied vTokens as backing a loan. Until this lands the collateral is outside the borrow
 * math, so a borrow would be refused. Sent to the Comptroller. */
export function buildEnterMarketsTx(vTokens: Address[]): TxRequest {
  return {
    to: VENUS_COMPTROLLER,
    data: encodeFunctionData({ abi: COMPTROLLER_WRITE_ABI, functionName: "enterMarkets", args: [vTokens.map(getAddress)] }),
    value: 0n,
  }
}

/** Draw USDT against the entered collateral. Sent to vUSDT. Amount is USDT wei (18 decimals on BSC). */
export function buildBorrowUsdtTx(amount: bigint): TxRequest {
  return {
    to: VUSDT,
    data: encodeFunctionData({ abi: VTOKEN_WRITE_ABI, functionName: "borrow", args: [amount] }),
    value: 0n,
  }
}

/** Repay borrowed USDT. Sent to vUSDT. The account must approve vUSDT to pull the USDT first. */
export function buildRepayUsdtTx(amount: bigint): TxRequest {
  return {
    to: VUSDT,
    data: encodeFunctionData({ abi: VTOKEN_WRITE_ABI, functionName: "repayBorrow", args: [amount] }),
    value: 0n,
  }
}

/** Stop using a market as collateral. Refused by Venus if it would push the account into shortfall. */
export function buildExitMarketTx(vToken: Address): TxRequest {
  return {
    to: VENUS_COMPTROLLER,
    data: encodeFunctionData({ abi: COMPTROLLER_WRITE_ABI, functionName: "exitMarket", args: [getAddress(vToken)] }),
    value: 0n,
  }
}

export interface SwipeTxInput {
  /** The collateral bStock: ticker key (TSLAB) or a vToken address. */
  market: string
  /** Underlying address, required only when the market is not in the pinned table. */
  underlying?: Address
  /** bStock supplied as collateral, in wei (bStocks are 18 decimals). */
  collateralAmount: bigint
  /** USDT to borrow, in wei (USDT is 18 decimals on BSC). */
  borrowUsdtAmount: bigint
}

/**
 * The full unsigned Swipe sequence, in submit order: approve, supply, enter-markets, borrow. Each
 * entry is a { to, data, value } request plus a human label. The caller signs and submits them in
 * order with gas; this function places nothing on chain. Sizing the borrow safely is the job of
 * readSwipeQuote/planBorrow, which this does not re-check, so pass a borrow amount already vetted.
 */
export function buildSwipeTxs(input: SwipeTxInput): LabeledTx[] {
  const { vToken, underlying } = resolveMarket(input.market, input.underlying)
  return [
    { label: "approve", note: `approve vToken ${vToken} to pull the bStock collateral`, ...buildApproveTx(underlying, vToken, input.collateralAmount) },
    { label: "supply", note: `mint ${vToken}: supply the bStock as collateral (still owned, not sold)`, ...buildSupplyTx(vToken, input.collateralAmount) },
    { label: "enterMarkets", note: "flag the supplied bStock as collateral backing the loan", ...buildEnterMarketsTx([vToken]) },
    { label: "borrow", note: `borrow USDT from vUSDT ${VUSDT} against the collateral`, ...buildBorrowUsdtTx(input.borrowUsdtAmount) },
  ]
}
