// Venus account reads for "Swipe": borrowing USDT against a bStocks position the holder keeps.
// SPOT collateralised borrowing, NOT a perp and NOT margin. The health factor is DERIVED, because
// Venus publishes liquidity and shortfall and never a health factor, then it is reconciled against
// the Comptroller's own liquidity answer. Every leg is a plain BSC RPC read: no Binance Web3 API,
// no key, and nothing here ever signs or sends.
//
// Two facts shape the reads, both re-confirmed on 2026-09-23. The Comptroller is a Diamond, so
// getEffectiveLtvFactor and getAccountLiquidity sit on facets. Collateral factor and liquidation
// threshold are separate numbers on newer markets (the bStock markets read 0.6/0.7 and 0.5/0.65),
// and getAccountLiquidity weights by the liquidation threshold, so the two weights are never mixed.
import { isAddress, getAddress, type Address } from "viem"
import { withRpc } from "./rpc.js"
import {
  VENUS_COMPTROLLER,
  COMPTROLLER_ABI,
  VTOKEN_ABI,
  ORACLE_ABI,
  VAI_CONTROLLER_ABI,
  WEIGHT_COLLATERAL_FACTOR,
  WEIGHT_LIQUIDATION_THRESHOLD,
  WAD,
} from "./constants.js"

export const HEALTH_FACTOR_FORMULA =
  "HF = sumCollateral(liquidationThreshold) / sumBorrow. Venus publishes liquidity and shortfall, " +
  "never a health factor, so this is derived. Per entered market, collateral = liquidationThreshold " +
  "* exchangeRateStored/1e18 * oraclePrice/1e18 * vTokenBalance/1e18 and debt = oraclePrice * " +
  "borrowBalance/1e18, both USD scaled 1e18, all integer truncating. VAIController.getVAIRepayAmount " +
  "adds to the debt. Venus liquidates when shortfall is non-zero, which is exactly HF < 1."

// One entered market at the pinned block, read but not yet derived.
interface MarketPosition {
  vToken: Address
  symbol: string
  vTokenBalance: bigint
  borrowBalance: bigint
  exchangeRate: bigint
  price: bigint
  collateralFactorMantissa: bigint
  liquidationThresholdMantissa: bigint
}

export interface VenusAccountMarket {
  symbol: string
  /** Unweighted position value, so the row shows the holding while the total does the weighting. */
  suppliedUsd: number
  borrowedUsd: number
  collateralFactor: number
  liquidationThreshold: number
  weightedCollateralUsd: number
}

export interface VenusAccountReport {
  account: Address
  /** Weighted collateral / total borrow. Null when there is no debt. */
  healthFactor: number | null
  /** Collateral weighted by liquidation threshold. */
  totalCollateralUsd: number | null
  /** Raw, unweighted supplied value. */
  totalSuppliedUsd: number | null
  totalBorrowUsd: number | null
  liquidityUsd: number | null
  shortfallUsd: number | null
  priceDropToLiquidationPct: number | null
  markets: VenusAccountMarket[]
  formula: string
  readAt: number
  atBlock: number
}

type Attempt = { status: "success"; result: unknown } | { status: "failure"; error: unknown }
function ok(a: Attempt | undefined): unknown {
  return a && a.status === "success" ? a.result : null
}
function toUsd(wad: bigint): number {
  return Number(wad) / 1e18
}

const MARKETS_PER_BATCH = 10
const CALLS_PER_MARKET = 5

/**
 * The account's Venus core-pool position, every leg read at one block. A caller gets numbers or it
 * gets null: a leg that did not answer nulls the totals rather than dropping out of a sum, because a
 * sum that quietly lost a market reads as a healthier account than it is.
 *
 * `markets` is the entered set from getAssetsIn, not every market the account holds a vToken in.
 * Supplying without enterMarkets leaves the balance outside the protocol's liquidity math, so
 * counting it would overstate collateral against a threshold Venus never applies.
 */
export async function readVenusAccount(account: string): Promise<VenusAccountReport> {
  if (!isAddress(account, { strict: false })) throw new Error(`not an address: ${account}`)
  const acct = getAddress(account)
  const comptroller = VENUS_COMPTROLLER

  return withRpc(async (c) => {
    // One block for the whole read. BSC blocks are ~0.75s apart and debt accrues every block, so a
    // position stitched from two blocks cannot be reconciled against the Comptroller.
    const atBlock = await c.getBlockNumber()
    const head = (await c.multicall({
      contracts: [
        { address: comptroller, abi: COMPTROLLER_ABI, functionName: "getAssetsIn", args: [acct] },
        { address: comptroller, abi: COMPTROLLER_ABI, functionName: "oracle" },
        { address: comptroller, abi: COMPTROLLER_ABI, functionName: "vaiController" },
      ],
      allowFailure: false,
      blockNumber: atBlock,
    })) as unknown as [readonly Address[], Address, Address]
    const [assets, oracle, vaiController] = head

    const rows: MarketPosition[] = []
    let incomplete = false
    for (let i = 0; i < assets.length; i += MARKETS_PER_BATCH) {
      const batch = assets.slice(i, i + MARKETS_PER_BATCH)
      const contracts = batch.flatMap((v) => [
        { address: v, abi: VTOKEN_ABI, functionName: "getAccountSnapshot", args: [acct] },
        { address: v, abi: VTOKEN_ABI, functionName: "symbol" },
        { address: oracle, abi: ORACLE_ABI, functionName: "getUnderlyingPrice", args: [v] },
        { address: comptroller, abi: COMPTROLLER_ABI, functionName: "getEffectiveLtvFactor", args: [acct, v, WEIGHT_COLLATERAL_FACTOR] },
        { address: comptroller, abi: COMPTROLLER_ABI, functionName: "getEffectiveLtvFactor", args: [acct, v, WEIGHT_LIQUIDATION_THRESHOLD] },
      ])
      const res = (await c.multicall({ contracts, allowFailure: true, blockNumber: atBlock })) as unknown as Attempt[]
      // Multicall3 drops entries on overflow instead of erroring, so a short answer is a batch-size
      // bug rather than a chain fact and it must not be averaged over.
      if (res.length !== contracts.length) throw new Error(`multicall returned ${res.length} of ${contracts.length} calls`)
      for (let j = 0; j < batch.length; j++) {
        const vToken = batch[j] as Address
        const base = j * CALLS_PER_MARKET
        const snap = ok(res[base]) as readonly [bigint, bigint, bigint, bigint] | null
        const price = ok(res[base + 2]) as bigint | null
        const cf = ok(res[base + 3]) as bigint | null
        const lt = ok(res[base + 4]) as bigint | null
        // Venus returns an error code in the first slot instead of reverting, so a non-zero code is a
        // failed read that happens to have decoded.
        if (!snap || snap[0] !== 0n || price === null || cf === null || lt === null) {
          incomplete = true
          continue
        }
        const symbol = ok(res[base + 1])
        rows.push({
          vToken,
          symbol: typeof symbol === "string" && symbol !== "" ? symbol : vToken,
          vTokenBalance: snap[1],
          borrowBalance: snap[2],
          exchangeRate: snap[3],
          price,
          collateralFactorMantissa: cf,
          liquidationThresholdMantissa: lt,
        })
      }
    }

    const tail = (await c.multicall({
      contracts: [
        { address: comptroller, abi: COMPTROLLER_ABI, functionName: "getAccountLiquidity", args: [acct] },
        { address: vaiController, abi: VAI_CONTROLLER_ABI, functionName: "getVAIRepayAmount", args: [acct] },
      ],
      allowFailure: true,
      blockNumber: atBlock,
    })) as unknown as Attempt[]
    const liq = ok(tail[0]) as readonly [bigint, bigint, bigint] | null
    const vaiDebt = ok(tail[1]) as bigint | null
    if (vaiDebt === null) incomplete = true

    let sumCollateral = 0n
    let sumSupplied = 0n
    let sumBorrow = vaiDebt ?? 0n
    const markets = rows.map((r) => {
      const weighted = (((r.liquidationThresholdMantissa * r.exchangeRate) / WAD) * r.price) / WAD
      const supplied = (((r.exchangeRate * r.price) / WAD) * r.vTokenBalance) / WAD
      const borrowed = (r.price * r.borrowBalance) / WAD
      sumCollateral += (weighted * r.vTokenBalance) / WAD
      sumSupplied += supplied
      sumBorrow += borrowed
      return {
        symbol: r.symbol,
        suppliedUsd: toUsd(supplied),
        borrowedUsd: toUsd(borrowed),
        collateralFactor: Number(r.collateralFactorMantissa) / 1e18,
        liquidationThreshold: Number(r.liquidationThresholdMantissa) / 1e18,
        weightedCollateralUsd: toUsd((weighted * r.vTokenBalance) / WAD),
      }
    })

    const totalCollateralUsd = incomplete ? null : toUsd(sumCollateral)
    const totalSuppliedUsd = incomplete ? null : toUsd(sumSupplied)
    const totalBorrowUsd = incomplete ? null : toUsd(sumBorrow)
    // Venus puts an error code in the first slot when the other two mean nothing.
    const liquidityUsd = liq && liq[0] === 0n ? toUsd(liq[1]) : null
    const shortfallUsd = liq && liq[0] === 0n ? toUsd(liq[2]) : null
    const healthFactor =
      totalCollateralUsd === null || totalBorrowUsd === null || totalBorrowUsd === 0
        ? null
        : totalCollateralUsd / totalBorrowUsd
    const priceDropToLiquidationPct = healthFactor === null ? null : Math.max(0, 1 - 1 / healthFactor) * 100

    return {
      account: acct,
      healthFactor,
      totalCollateralUsd,
      totalSuppliedUsd,
      totalBorrowUsd,
      liquidityUsd,
      shortfallUsd,
      priceDropToLiquidationPct,
      markets,
      formula: HEALTH_FACTOR_FORMULA,
      readAt: Date.now(),
      atBlock: Number(atBlock),
    }
  })
}
