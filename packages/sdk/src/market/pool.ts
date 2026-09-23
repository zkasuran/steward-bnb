// PancakeSwap v3 pool reads on BSC: resolve a pool for a pair, verify it against the factory, and
// read its state at one pinned block. Every field in a PoolState comes from that single block,
// because reading the price from one call and liquidity from another describes a state that never
// existed. These are plain BSC RPC reads, no Binance Web3 API, so they need no key.
import {
  formatUnits,
  getAddress,
  isAddressEqual,
  erc20Abi,
  type Address,
  type PublicClient,
} from "viem"
import { makeClient } from "../chain/bstocks.js"
import { RPC_ENDPOINTS, USDT } from "../chain/constants.js"
import { FACTORY_ABI, POOL_ABI, V3_FACTORY, V3_FEE_TIERS } from "./constants.js"
import { price1Per0, rawPrice, TICK_BASE } from "./math.js"

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000"

// How far the price from sqrtPriceX96 may sit from 1.0001^tick before the read is treated as a bad
// decode rather than a moving market. The tick is a floor so the true gap is under one tick (1 bp);
// this bound is loose on purpose, it catches a mangled ABI, not the market.
const TICK_CHECK_TOLERANCE = 0.01

// Interactive read endpoints, primary first. Every read in this module is current-block state
// (slot0, liquidity, balances, factory lookups), never logs or history, so it uses the interactive
// tier. The bulk tier exists only for log/historical sweeps, which this module never does.
const READ_URLS: readonly string[] = [RPC_ENDPOINTS.primary, ...RPC_ENDPOINTS.fallbacks]

const clients = new Map<string, PublicClient>()
function clientFor(url: string): PublicClient {
  const existing = clients.get(url)
  if (existing) return existing
  const c = makeClient(url)
  clients.set(url, c)
  return c
}

// Run a read against each endpoint in order until one answers, so a single flaky public node does
// not sink a read the next node would serve. Errors are collected, not swallowed, so a total
// failure says which endpoints were tried and why each refused.
export async function withRpc<T>(fn: (client: PublicClient) => Promise<T>): Promise<T> {
  const errors: string[] = []
  for (const url of READ_URLS) {
    try {
      return await fn(clientFor(url))
    } catch (e) {
      errors.push(`${url}: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`)
    }
  }
  throw new Error(`every RPC endpoint refused:\n${errors.join("\n")}`)
}

export interface PoolState {
  pool: Address
  token0: Address
  token1: Address
  symbol0: string
  symbol1: string
  // Read from each token, never assumed. USDT on BSC is 18 decimals, not the 6 it is elsewhere,
  // and code carried from a 6-decimal chain is wrong here.
  decimals0: number
  decimals1: number
  // Parts per million. PancakeSwap v3 on BSC enables 100, 500, 2500 and 10000. There is no 3000.
  fee: number
  tickSpacing: number
  // The pool's current tick, floor of log(price) base 1.0001.
  tick: number
  // Decimal strings, because both overflow a double.
  sqrtPriceX96: string
  // In-range liquidity only. This is the depth at the current price that a swap moves against; the
  // pool's own interface says it has no relation to the total balances below.
  liquidity: string
  // Actual token balances the pool contract holds, raw and human. In v3 these include out-of-range
  // liquidity and uncollected fees, so they are a ceiling on what a swap could ever take, not the
  // depth at the current price.
  reserve0: string
  reserve1: string
  reserve0Human: number
  reserve1Human: number
  // Spot price, token1 per token0, human units. Invert to read the pair the other way.
  price1Per0: number
  // Wall clock of the read, ms since epoch.
  readAt: number
  // The one block every field above was read at.
  atBlock: number
}

// Pool state at one pinned block. The factory ownership check is what makes this also the "verify a
// known pool" path: it reads token0/token1/fee off the pool, then refuses anything the factory does
// not own for that pair and tier, so a faked pool address cannot pass.
export async function readPoolState(client: PublicClient, pool: string): Promise<PoolState> {
  const address = getAddress(pool)
  const atBlock = await client.getBlockNumber({ cacheTime: 0 })

  const core = await client.multicall({
    contracts: [
      { address, abi: POOL_ABI, functionName: "token0" },
      { address, abi: POOL_ABI, functionName: "token1" },
      { address, abi: POOL_ABI, functionName: "fee" },
      { address, abi: POOL_ABI, functionName: "tickSpacing" },
      { address, abi: POOL_ABI, functionName: "liquidity" },
      { address, abi: POOL_ABI, functionName: "slot0" },
    ],
    allowFailure: false,
    blockNumber: atBlock,
  })
  const [token0, token1, fee, tickSpacing, liquidity, slot0] = core
  const [sqrtPriceX96, tick] = slot0

  const meta = await client.multicall({
    contracts: [
      { address: token0, abi: erc20Abi, functionName: "symbol" },
      { address: token0, abi: erc20Abi, functionName: "decimals" },
      { address: token1, abi: erc20Abi, functionName: "symbol" },
      { address: token1, abi: erc20Abi, functionName: "decimals" },
      { address: token0, abi: erc20Abi, functionName: "balanceOf", args: [address] },
      { address: token1, abi: erc20Abi, functionName: "balanceOf", args: [address] },
    ],
    allowFailure: false,
    blockNumber: atBlock,
  })
  const [symbol0, decimals0, symbol1, decimals1, reserve0, reserve1] = meta

  const owned = await client.readContract({
    address: V3_FACTORY,
    abi: FACTORY_ABI,
    functionName: "getPool",
    args: [token0, token1, fee],
    blockNumber: atBlock,
  })
  if (!isAddressEqual(owned, address)) {
    throw new Error(
      `${address} is not a PancakeSwap v3 pool: the factory's ${symbol0}/${symbol1} pool at fee ${fee} is ${owned}`,
    )
  }

  // slot0 carries the price and the tick separately, so one checks the other. A gap wider than a
  // tick means the decode is wrong, not that the market moved.
  const raw = rawPrice(sqrtPriceX96)
  const fromTick = TICK_BASE ** tick
  const gap = Math.abs(raw / fromTick - 1)
  if (!(gap < TICK_CHECK_TOLERANCE)) {
    throw new Error(
      `${address}: sqrtPriceX96 gives ${raw} where 1.0001^${tick} gives ${fromTick}, ${(gap * 100).toFixed(2)}% apart`,
    )
  }

  const price = price1Per0(sqrtPriceX96, decimals0, decimals1)
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(
      `${address}: sqrtPriceX96 ${sqrtPriceX96} at decimals ${decimals0}/${decimals1} gives ${price}`,
    )
  }

  return {
    pool: address,
    token0,
    token1,
    symbol0,
    symbol1,
    decimals0,
    decimals1,
    fee,
    tickSpacing,
    tick,
    sqrtPriceX96: sqrtPriceX96.toString(),
    liquidity: liquidity.toString(),
    reserve0: reserve0.toString(),
    reserve1: reserve1.toString(),
    reserve0Human: Number(formatUnits(reserve0, decimals0)),
    reserve1Human: Number(formatUnits(reserve1, decimals1)),
    price1Per0: price,
    readAt: Date.now(),
    atBlock: Number(atBlock),
  }
}

// The factory's pool for a pair at one fee tier, or null when it has never been created (the
// factory returns the zero address for a pair it does not own at that tier).
export async function resolvePool(
  client: PublicClient,
  tokenA: Address,
  tokenB: Address,
  fee: number,
): Promise<Address | null> {
  const pool = await client.readContract({
    address: V3_FACTORY,
    abi: FACTORY_ABI,
    functionName: "getPool",
    args: [getAddress(tokenA), getAddress(tokenB), fee],
  })
  return isAddressEqual(pool, ZERO_ADDRESS) ? null : getAddress(pool)
}

// Every fee tier that actually has a pool for the pair, with its address.
export async function findPoolAddresses(
  client: PublicClient,
  tokenA: Address,
  tokenB: Address,
): Promise<{ fee: number; pool: Address }[]> {
  const results = await Promise.all(V3_FEE_TIERS.map((fee) => resolvePool(client, tokenA, tokenB, fee)))
  const out: { fee: number; pool: Address }[] = []
  V3_FEE_TIERS.forEach((fee, i) => {
    const pool = results[i]
    if (pool) out.push({ fee, pool })
  })
  return out
}

// The deepest pool for the pair, chosen by in-range liquidity, or null when the pair has no v3
// pool at any tier. A pair can have several pools; for a price or a buy the one with the most
// liquidity is the one a trade would actually route through.
export async function findBestPool(
  client: PublicClient,
  tokenA: Address,
  tokenB: Address,
): Promise<PoolState | null> {
  const found = await findPoolAddresses(client, tokenA, tokenB)
  if (found.length === 0) return null
  const states = await Promise.all(found.map((f) => readPoolState(client, f.pool)))
  return states.reduce((best, s) => (BigInt(s.liquidity) > BigInt(best.liquidity) ? s : best))
}

export interface MarketOptions {
  // Quote token. Defaults to BSC USDT, the quote for the bStocks pools.
  quote?: Address
  // Read this exact pool address (the verify-a-known-pool path) and skip discovery.
  pool?: string
  // Resolve this one fee tier instead of picking the deepest across all tiers.
  fee?: number
  // Use this client instead of the built-in endpoint fallback (e.g. one built on a bulk endpoint).
  client?: PublicClient
}

// One call from a bStock token to its live pool state, quoted against USDT by default. Manages its
// own endpoint fallback unless a client is supplied, so a consumer needs neither a client nor a
// pool address to get a price.
export async function getMarket(token: Address, opts: MarketOptions = {}): Promise<PoolState> {
  const quote = opts.quote ?? USDT
  const run = async (client: PublicClient): Promise<PoolState> => {
    if (opts.pool) return readPoolState(client, opts.pool)
    if (opts.fee !== undefined) {
      const pool = await resolvePool(client, token, quote, opts.fee)
      if (!pool) throw new Error(`no PancakeSwap v3 pool for ${token} / ${quote} at fee ${opts.fee}`)
      return readPoolState(client, pool)
    }
    const best = await findBestPool(client, token, quote)
    if (!best) {
      throw new Error(`no PancakeSwap v3 pool for ${token} / ${quote} across tiers ${V3_FEE_TIERS.join(", ")}`)
    }
    return best
  }
  return opts.client ? run(opts.client) : withRpc(run)
}

// USDT-in-USDT-out sanity: which slot USDT sits in for a given pool. Throws when neither token is
// the quote, because a bStock price in USDT is undefined without a USDT leg.
export function quoteSlot(state: PoolState, quote: Address = USDT): { quoteIsToken0: boolean } {
  if (isAddressEqual(state.token0, quote)) return { quoteIsToken0: true }
  if (isAddressEqual(state.token1, quote)) return { quoteIsToken0: false }
  throw new Error(`pool ${state.pool} pairs ${state.symbol0}/${state.symbol1}, neither is the quote ${quote}`)
}

// Spot price of the non-quote (base) token in the quote token, decimals-correct, for whichever slot
// the quote sits in. For a bStock/USDT pool this is USDT per bStock.
export function spotInQuote(state: PoolState, quote: Address = USDT): number {
  const { quoteIsToken0 } = quoteSlot(state, quote)
  return quoteIsToken0 ? 1 / state.price1Per0 : state.price1Per0
}
