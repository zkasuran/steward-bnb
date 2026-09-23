// PancakeSwap v3 constants for BNB Smart Chain. Addresses and fee tiers are re-verified on
// chain (verifyPool checks the factory owns a pool and reads token0/token1/fee), never trusted
// from this file alone.
import { erc20Abi, parseAbi, type Address } from "viem"

// PancakeV3Factory. A pool address is cheap to fake, so every pool this module reads is checked
// against factory.getPool(token0, token1, fee) before its numbers are used.
export const V3_FACTORY: Address = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"

// The fee tiers PancakeSwap v3 enables on BSC, in parts per million: 0.01%, 0.05%, 0.25%, 1%.
// There is no 0.3% (3000) tier here, unlike Uniswap v3, so a pasted Uniswap tier list misses.
export const V3_FEE_TIERS = [100, 500, 2500, 10000] as const

// Known bStock/USDT v3 pools sighted in lane research. Both are re-verified on chain before use;
// a wrong address here is caught by verifyPool, not believed. Fees are read off the pool, so the
// notes are only hints.
export const KNOWN_POOLS: Record<string, Address> = {
  // AAPLB/USDT, reported fee 2500 (0.25%).
  AAPLB: "0xe9b9998B2EC5430D2246c7f1F8D9f298c97D7365",
  // NVDAB/USDT, fee not yet verified in this lane.
  NVDAB: "0x8FB4243b553aC29BA088aCf00B9B7dA24bD6690C",
}

// The whole slot0 tuple is spelled out because a short returns clause silently drops the fields
// it does not name. feeProtocol is uint32 on PancakeV3Pool where Uniswap v3 has uint8: a uint8
// clause decodes this pool's value into it and raises nothing, so a Uniswap ABI mangles the call
// with no sign of it.
export const POOL_ABI = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)",
])

export const FACTORY_ABI = parseAbi([
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)",
])

// Re-exported so a consumer reading reserves and metadata has one ERC-20 ABI to import.
export { erc20Abi }
