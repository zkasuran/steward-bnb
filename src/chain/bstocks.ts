// bStocks on-chain reader. The core rule: resolve a token by its beacon, never by symbol,
// because the "bStocks" symbol is scam-squatted on BSC. Everything here is a plain BSC RPC
// read, no Binance Web3 API, so it needs no API key.
import {
  createPublicClient,
  http,
  erc20Abi,
  getAddress,
  isAddressEqual,
  type Address,
  type PublicClient,
} from "viem"
import { bsc } from "viem/chains"
import { BSTOCKS_BEACON, EIP1967_BEACON_SLOT, RPC_ENDPOINTS } from "./constants.js"

export function makeClient(rpcUrl: string = RPC_ENDPOINTS.primary): PublicClient {
  return createPublicClient({ chain: bsc, transport: http(rpcUrl) }) as PublicClient
}

// Read the EIP-1967 beacon slot of a proxy and return the beacon address, or null if the
// slot is empty (the token is not a beacon proxy at all).
export async function readBeacon(client: PublicClient, token: Address): Promise<Address | null> {
  const raw = await client.getStorageAt({ address: token, slot: EIP1967_BEACON_SLOT })
  if (!raw || raw.length < 42) return null
  const addr = getAddress(("0x" + raw.slice(-40)) as Address)
  if (isAddressEqual(addr, "0x0000000000000000000000000000000000000000")) return null
  return addr
}

// Authenticity: a token is genuine bStocks iff its beacon slot points at the known beacon.
export async function isGenuineBStock(client: PublicClient, token: Address): Promise<boolean> {
  const beacon = await readBeacon(client, token)
  return beacon !== null && isAddressEqual(beacon, BSTOCKS_BEACON)
}

export type TokenMeta = {
  address: Address
  name: string
  symbol: string
  decimals: number
  totalSupply: bigint
}

export async function readTokenMeta(client: PublicClient, token: Address): Promise<TokenMeta> {
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "name" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
  ])
  return { address: getAddress(token), name, symbol, decimals, totalSupply }
}

// Current balance. Note: a bStocks balance can change WITHOUT a transfer, because the token
// rebases on dividends and splits. So this is a point-in-time read, never a value to cache.
export async function readBalance(
  client: PublicClient,
  owner: Address,
  token: Address,
): Promise<bigint> {
  return client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] })
}

export type Holding = TokenMeta & { genuine: boolean; balance: bigint }

// Read an owner's holdings across a set of candidate tokens, verifying each by beacon first.
// A non-genuine token is returned with genuine=false and a zero balance rather than trusted.
export async function readHoldings(
  client: PublicClient,
  owner: Address,
  tokens: Address[],
): Promise<Holding[]> {
  const out: Holding[] = []
  for (const token of tokens) {
    const genuine = await isGenuineBStock(client, token)
    const meta = await readTokenMeta(client, token)
    const balance = genuine ? await readBalance(client, owner, token) : 0n
    out.push({ ...meta, genuine, balance })
  }
  return out
}
