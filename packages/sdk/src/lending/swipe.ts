// "Swipe" single-collateral view: read one bStock's Venus market live and quote the largest safe
// USDT borrow against a supplied amount of it. SPOT collateralised borrowing, NOT a perp and NOT
// margin. This is the common case, supply one bStock and draw USDT; for an account holding several
// collaterals use readVenusAccount, which weights the whole entered set. Reads only, no key, no send.
import { isAddress, getAddress, type Address, type PublicClient } from "viem"
import { isGenuineBStock } from "../chain/bstocks.js"
import { withRpc } from "./rpc.js"
import {
  VENUS_COMPTROLLER,
  VUSDT,
  BSTOCK_VENUS_MARKETS,
  COMPTROLLER_ABI,
  VTOKEN_ABI,
  ORACLE_ABI,
  ERC20_MINIMAL_ABI,
  WEIGHT_COLLATERAL_FACTOR,
  WEIGHT_LIQUIDATION_THRESHOLD,
} from "./constants.js"
import { planBorrow, type BorrowPlan } from "./math.js"

// A non-participating probe: E-mode is per-account opt-in, so an address that entered nothing yields
// the market's base collateral factor and liquidation threshold, which is the market-level view.
const PROBE_ACCOUNT: Address = "0x0000000000000000000000000000000000000001"

/** A bStock market, named by its ticker key (TSLAB), its underlying address, or its vToken address. */
export type MarketRef = string

export interface BStockMarketInfo {
  symbol: string
  vToken: Address
  underlying: Address
  underlyingDecimals: number
  /** Underlying passes the bStocks beacon check, so it is a genuine bStock and not a name-squat. */
  genuineBStock: boolean
  isListed: boolean
  /** Live collateral factor (borrow-capacity weight). */
  collateralFactor: number
  /** Live liquidation threshold (liquidation weight). */
  liquidationThreshold: number
  /** USD per one whole underlying token, from the Venus resilient oracle. */
  priceUsd: number
  atBlock: number
}

// USD for one whole unit of an underlying: getUnderlyingPrice is scaled 1e(36 - decimals).
function priceToUsd(price: bigint, decimals: number): number {
  return Number(price) / 10 ** (36 - decimals)
}

async function resolveVToken(
  c: PublicClient,
  ref: MarketRef,
): Promise<{ vToken: Address; underlying: Address | null; symbol: string | null }> {
  const known = BSTOCK_VENUS_MARKETS[ref.toUpperCase()]
  if (known) return { vToken: known.vToken, underlying: known.underlying, symbol: known.symbol }
  if (isAddress(ref, { strict: false })) {
    const addr = getAddress(ref)
    // A known vToken or a known underlying resolves without a read.
    for (const m of Object.values(BSTOCK_VENUS_MARKETS)) {
      if (addr.toLowerCase() === m.vToken.toLowerCase()) return { vToken: m.vToken, underlying: m.underlying, symbol: m.symbol }
      if (addr.toLowerCase() === m.underlying.toLowerCase()) return { vToken: m.vToken, underlying: m.underlying, symbol: m.symbol }
    }
    // Otherwise treat it as a vToken and read its underlying live, so a market not in the pinned
    // table still resolves rather than being rejected.
    const underlying = (await c.readContract({ address: addr, abi: VTOKEN_ABI, functionName: "underlying" })) as Address
    return { vToken: addr, underlying, symbol: null }
  }
  throw new Error(`unknown market ref: ${ref}. Use a ticker key, an underlying address, or a vToken address.`)
}

/** Read one bStock's Venus market live: listing, factors, oracle price and authenticity. */
export async function readBStockMarket(ref: MarketRef): Promise<BStockMarketInfo> {
  return withRpc(async (c) => {
    const atBlock = await c.getBlockNumber()
    const { vToken, underlying: known, symbol: knownSymbol } = await resolveVToken(c, ref)
    const [oracle, marketRow, symbol] = (await c.multicall({
      contracts: [
        { address: VENUS_COMPTROLLER, abi: COMPTROLLER_ABI, functionName: "oracle" },
        { address: VENUS_COMPTROLLER, abi: COMPTROLLER_ABI, functionName: "markets", args: [vToken] },
        { address: vToken, abi: VTOKEN_ABI, functionName: "symbol" },
      ],
      allowFailure: false,
      blockNumber: atBlock,
    })) as unknown as [Address, readonly [boolean, bigint, boolean], string]
    const underlying = known ?? ((await c.readContract({ address: vToken, abi: VTOKEN_ABI, functionName: "underlying", blockNumber: atBlock })) as Address)

    const [price, cf, lt, decimals, genuine] = await Promise.all([
      c.readContract({ address: oracle, abi: ORACLE_ABI, functionName: "getUnderlyingPrice", args: [vToken], blockNumber: atBlock }) as Promise<bigint>,
      c.readContract({ address: VENUS_COMPTROLLER, abi: COMPTROLLER_ABI, functionName: "getEffectiveLtvFactor", args: [PROBE_ACCOUNT, vToken, WEIGHT_COLLATERAL_FACTOR], blockNumber: atBlock }) as Promise<bigint>,
      c.readContract({ address: VENUS_COMPTROLLER, abi: COMPTROLLER_ABI, functionName: "getEffectiveLtvFactor", args: [PROBE_ACCOUNT, vToken, WEIGHT_LIQUIDATION_THRESHOLD], blockNumber: atBlock }) as Promise<bigint>,
      c.readContract({ address: underlying, abi: ERC20_MINIMAL_ABI, functionName: "decimals", blockNumber: atBlock }) as Promise<number>,
      isGenuineBStock(c, underlying),
    ])

    return {
      symbol: knownSymbol ?? (symbol || vToken),
      vToken,
      underlying: getAddress(underlying),
      underlyingDecimals: decimals,
      genuineBStock: genuine,
      isListed: marketRow[0],
      collateralFactor: Number(cf) / 1e18,
      liquidationThreshold: Number(lt) / 1e18,
      priceUsd: priceToUsd(price, decimals),
      atBlock: Number(atBlock),
    }
  })
}

export interface SwipeQuoteInput {
  /** The bStock offered as collateral: ticker key, underlying address, or vToken address. */
  market: MarketRef
  /** How many whole bStock tokens are supplied as collateral (e.g. 3.5). */
  collateralUnits: number
  /** The health-factor buffer to keep after borrowing, e.g. 2.0. */
  targetHealthFactor: number
  /** Optional account: its current USDT debt on Venus is read and folded into the plan. */
  account?: string
}

export interface SwipeQuote {
  market: BStockMarketInfo
  collateralValueUsd: number
  existingUsdtBorrowUsd: number
  /** Live USDT liquidity available to borrow from vUSDT, in USD. */
  availableUsdtLiquidityUsd: number
  plan: BorrowPlan
  /** The borrow actually fundable now: the plan capped by available USDT liquidity. */
  fundableBorrowUsd: number
}

/**
 * Quote the largest safe USDT borrow against a supplied bStock amount, at a target health factor.
 * Ties the live market read to the pure planBorrow math and to the live USDT liquidity, so the
 * number returned is both safe (health-factor and collateral-factor bounded) and fundable.
 */
export async function readSwipeQuote(input: SwipeQuoteInput): Promise<SwipeQuote> {
  if (input.collateralUnits < 0) throw new Error(`collateralUnits must be >= 0: ${input.collateralUnits}`)
  const market = await readBStockMarket(input.market)
  const collateralValueUsd = input.collateralUnits * market.priceUsd

  return withRpc(async (c) => {
    const atBlock = await c.getBlockNumber()
    const oracle = (await c.readContract({ address: VENUS_COMPTROLLER, abi: COMPTROLLER_ABI, functionName: "oracle", blockNumber: atBlock })) as Address
    const usdtPrice = (await c.readContract({ address: oracle, abi: ORACLE_ABI, functionName: "getUnderlyingPrice", args: [VUSDT], blockNumber: atBlock })) as bigint
    const cash = (await c.readContract({ address: VUSDT, abi: VTOKEN_ABI, functionName: "getCash", blockNumber: atBlock })) as bigint
    // USDT is 18 decimals on BSC, so its oracle price is scaled 1e18 and cash is 1e18.
    const usdtUsdPerToken = priceToUsd(usdtPrice, 18)
    const availableUsdtLiquidityUsd = (Number(cash) / 1e18) * usdtUsdPerToken

    let existingUsdtBorrowUsd = 0
    if (input.account !== undefined) {
      if (!isAddress(input.account, { strict: false })) throw new Error(`not an address: ${input.account}`)
      const snap = (await c.readContract({
        address: VUSDT,
        abi: VTOKEN_ABI,
        functionName: "getAccountSnapshot",
        args: [getAddress(input.account)],
        blockNumber: atBlock,
      })) as readonly [bigint, bigint, bigint, bigint]
      if (snap[0] === 0n) existingUsdtBorrowUsd = (Number(snap[2]) / 1e18) * usdtUsdPerToken
    }

    const plan = planBorrow({
      collateralValueUsd,
      collateralFactor: market.collateralFactor,
      liquidationThreshold: market.liquidationThreshold,
      existingBorrowUsd: existingUsdtBorrowUsd,
      targetHealthFactor: input.targetHealthFactor,
    })

    return {
      market,
      collateralValueUsd,
      existingUsdtBorrowUsd,
      availableUsdtLiquidityUsd,
      plan,
      fundableBorrowUsd: Math.min(plan.maxSafeBorrowUsd, availableUsdtLiquidityUsd),
    }
  })
}
