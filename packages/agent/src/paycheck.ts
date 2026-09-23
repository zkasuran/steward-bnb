// Paycheck: route tracked dividend income through a b402 (x402 v2) payment over an EIP-3009 stablecoin.
//
// b402 settles a one-signature transfer: the payer signs a TransferWithAuthorization, sends no
// transaction and holds no BNB, then a facilitator submits it and pays the gas. This module builds the
// 402 payment requirement, the exact typed data the payer signs, a local verifier for that signature,
// and the UNSIGNED settle transaction. It settles NOTHING for real: there is no key and no gas here,
// and mainnet b402 facilitator access is granted on request, which this package does not hold.
//
// EIP-3009 works only on tokens that implement it. On BSC that is USD1 (verified) and U, NOT USDT or
// USDC (Permit2 only). So the income rail quotes in USD1 by default. If a platform payment requirement
// names a non-EIP-3009 asset, this module says so and does not fabricate an authorization for it.
import {
  getAddress,
  isAddress,
  recoverTypedDataAddress,
  parseAbi,
  type Address,
  type Hex,
  type TypedDataDomain,
} from "viem"
import type { api as sdkApi } from "@steward/sdk"
import { BSC_CAIP2, BSC_CHAIN_ID, EIP3009_TOKENS, HOUSE_WALLET, X402_VERSION } from "./constants.js"
import { buildCall, type UnsignedTx } from "./tx.js"

type Web3ApiClient = sdkApi.Web3ApiClient

// The 402 body a paid endpoint answers with. Both the x402 v1 amount name (maxAmountRequired) and the
// v2 name (amount) carry the same value, so a client reading either spelling finds it.
export interface PaymentRequirements {
  scheme: string
  network: string
  asset: Address
  maxAmountRequired: string
  amount: string
  payTo: Address
  resource: string
  description: string
  mimeType: string
  maxTimeoutSeconds: number
  extra: { name: string; version: string; decimals: number }
}

// The buyer's authorization budget, not a settlement SLA. b402 rejects a validBefore inside a few
// seconds of now, so 300 s leaves room to sign without a long-lived authorization outstanding.
const AUTHORIZATION_WINDOW_SECONDS = 300

function assertAtomic(value: string, field: string): void {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${field} must be atomic units as a positive decimal string, got ${JSON.stringify(value)}`)
  }
}

// Build the b402 402 requirement for an EIP-3009 income payment. `amountAtomic` is already scaled to
// the token's 18 decimals. Refuses a non-EIP-3009 token, because the signature path below cannot honour
// one.
export function buildPaymentRequirements(input: {
  amountAtomic: string
  resource: string
  description?: string
  payTo?: Address
  token?: "USD1" | "U"
}): PaymentRequirements {
  assertAtomic(input.amountAtomic, "amountAtomic")
  if (!/^https?:\/\/|^\//.test(input.resource)) {
    throw new Error(`resource must be an absolute URL or an absolute path, got ${JSON.stringify(input.resource)}`)
  }
  const token = EIP3009_TOKENS[input.token ?? "USD1"]
  return {
    scheme: "eip3009",
    network: BSC_CAIP2,
    asset: getAddress(token.address),
    maxAmountRequired: input.amountAtomic,
    amount: input.amountAtomic,
    payTo: getAddress(input.payTo ?? HOUSE_WALLET),
    resource: input.resource,
    description: input.description ?? "Dividend income routed via b402.",
    mimeType: "application/json",
    maxTimeoutSeconds: AUTHORIZATION_WINDOW_SECONDS,
    // name and version are the token's EIP-712 domain, which the payer needs to sign. decimals is not
    // in the x402 spec, but a validator refused a listing once because it could not price without it.
    extra: { name: token.domain.name, version: token.domain.version, decimals: token.decimals },
  }
}

export interface Eip3009Authorization {
  from: Address
  to: Address
  // Atomic units as a decimal string.
  value: string
  validAfter: number
  validBefore: number
  nonce: Hex
}

// The EIP-712 typed data the payer signs, in viem's native shape (message values are bigints). Pass it
// straight to viem's signTypedData or recoverTypedDataAddress. verifyingContract is the token, never a
// facilitator. Restricted to chain 56, because the domain and address are mainnet and do not survive a
// chain swap.
export function transferWithAuthorizationTypedData(input: { token?: "USD1" | "U"; authorization: Eip3009Authorization }) {
  const a = input.authorization
  assertAtomic(a.value, "value")
  if (!/^0x[0-9a-fA-F]{64}$/.test(a.nonce)) throw new Error("nonce must be 32 random bytes as hex")
  if (a.validBefore <= a.validAfter) {
    throw new Error(`validBefore ${a.validBefore} must be after validAfter ${a.validAfter}`)
  }
  const token = EIP3009_TOKENS[input.token ?? "USD1"]
  const domain: TypedDataDomain = {
    name: token.domain.name,
    version: token.domain.version,
    chainId: BSC_CHAIN_ID,
    verifyingContract: getAddress(token.address),
  }
  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  } as const
  const message = {
    from: getAddress(a.from),
    to: getAddress(a.to),
    value: BigInt(a.value),
    validAfter: BigInt(a.validAfter),
    validBefore: BigInt(a.validBefore),
    nonce: a.nonce,
  }
  return { domain, types, primaryType: "TransferWithAuthorization" as const, message }
}

export interface LocalVerify {
  ok: boolean
  reason: string | null
  from: Address | null
}

// Off-chain verification of a signed authorization: recover the signer from the EIP-712 signature over
// the exact typed data the token would check, then refuse anything that does not match what the 402
// asked for. What it does NOT catch: whether the payer holds the balance and whether the nonce is
// unused. Those are chain reads that belong in settle, before gas is spent.
export async function verifyPaymentAuthorization(
  authorization: Eip3009Authorization,
  signature: Hex,
  expect: { payTo: Address; value: string; token?: "USD1" | "U" },
): Promise<LocalVerify> {
  const fail = (reason: string): LocalVerify => ({ ok: false, reason, from: null })
  const a = authorization
  if (!isAddress(a.from) || !isAddress(a.to)) return fail("from or to is not an address")
  if (getAddress(a.to) !== getAddress(expect.payTo)) return fail(`authorization pays ${a.to}, the 402 asked for ${expect.payTo}`)
  if (!/^[0-9]+$/.test(a.value) || BigInt(a.value) < BigInt(expect.value)) {
    return fail(`authorization value ${a.value} is below the price ${expect.value}`)
  }
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(a.validBefore) || a.validBefore <= now) return fail("authorization has expired")
  if (!Number.isFinite(a.validAfter) || a.validAfter > now + 60) return fail("authorization is not valid yet")
  if (!/^0x[0-9a-fA-F]{64}$/.test(a.nonce)) return fail("nonce must be 32 bytes")
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return fail("signature must be 65 bytes")
  const typed = transferWithAuthorizationTypedData({ token: expect.token, authorization: a })
  let recovered: Address
  try {
    recovered = await recoverTypedDataAddress({
      domain: typed.domain,
      types: typed.types,
      primaryType: typed.primaryType,
      message: typed.message,
      signature,
    })
  } catch (err) {
    return fail(`signature does not recover: ${(err as Error).message.slice(0, 80)}`)
  }
  if (recovered.toLowerCase() !== a.from.toLowerCase()) return fail(`signature recovers to ${recovered}, not to ${a.from}`)
  return { ok: true, reason: null, from: getAddress(a.from) }
}

export const ERC3009_ABI = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
])

// Split a 65-byte signature into the v, r, s the token expects.
function splitSig(sig: Hex): { v: number; r: Hex; s: Hex } {
  const h = sig.startsWith("0x") ? sig.slice(2) : sig
  if (h.length !== 130) throw new Error("signature must be 65 bytes")
  let v = parseInt(h.slice(128, 130), 16)
  if (v < 27) v += 27
  return { v, r: `0x${h.slice(0, 64)}` as Hex, s: `0x${h.slice(64, 128)}` as Hex }
}

// Build the UNSIGNED transferWithAuthorization transaction that settles a signed authorization. Anyone
// can submit it (the payer's signature authorises the move), so whoever submits it pays the gas. This
// package does not submit it: the returned tx is a description for a funded facilitator to send. The
// caller must already hold the payer's signature.
export function buildSettleTx(input: { authorization: Eip3009Authorization; signature: Hex; token?: "USD1" | "U" }): UnsignedTx {
  const a = input.authorization
  const token = EIP3009_TOKENS[input.token ?? "USD1"]
  const { v, r, s } = splitSig(input.signature)
  return buildCall({
    action: "b402 settle: transferWithAuthorization",
    to: getAddress(token.address),
    abi: ERC3009_ABI,
    functionName: "transferWithAuthorization",
    args: [getAddress(a.from), getAddress(a.to), BigInt(a.value), BigInt(a.validAfter), BigInt(a.validBefore), a.nonce, v, r, s],
    signature: "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
    requires: ["the payer's signature (supplied)", "a facilitator with BNB for gas", "the payer's balance and an unused nonce (checked on chain before submit)"],
    note: `Settles a signed ${token.symbol} authorization by moving ${a.value} atomic units from the payer to ${a.to}. The payer sent no transaction and holds no BNB.`,
  })
}

export interface PaymentPlan {
  // The b402 402 requirement this rail issues (over an EIP-3009 token).
  requirement: PaymentRequirements
  // What a platform payment-requirements endpoint returned, when an api client was supplied, so the two
  // can be reconciled. Null when no client was given.
  platformRequirement: unknown | null
  reconciliation: string
  // When a payer address was supplied, the typed data to sign. Otherwise null, with `requires` naming
  // what the payer still has to provide.
  toSign: ReturnType<typeof transferWithAuthorizationTypedData> | null
  requires: string[]
  gated: true
  note: string
}

// The headline: take an amount of tracked dividend income and prepare its b402 payment. Builds the
// requirement over USD1, optionally reconciles it against the platform's own payment-requirements
// endpoint (the keyless MockWeb3ApiClient in a dry run). When a payer is known it also returns the
// exact typed data to sign. Settlement stays gated: this returns bytes to sign and a tx to submit, then
// sends nothing.
export async function routeDividendIncome(input: {
  amountAtomic: string
  resource?: string
  description?: string
  payTo?: Address
  token?: "USD1" | "U"
  api?: Web3ApiClient
  payer?: { from: Address; nonce: Hex; validAfter?: number; validBefore?: number }
}): Promise<PaymentPlan> {
  const resource = input.resource ?? "/paycheck/dividend"
  const payTo = getAddress(input.payTo ?? HOUSE_WALLET)
  const requirement = buildPaymentRequirements({
    amountAtomic: input.amountAtomic,
    resource,
    description: input.description,
    payTo,
    token: input.token,
  })

  let platformRequirement: unknown | null = null
  let reconciliation = "no platform requirement fetched (no api client supplied)"
  if (input.api) {
    const res = await input.api.getPaymentRequirements({ resource })
    platformRequirement = res.accepts
    const first = res.accepts[0]
    if (!first) {
      reconciliation = "platform returned no payment options"
    } else if (getAddress(first.asset).toLowerCase() === requirement.asset.toLowerCase()) {
      reconciliation = `platform requirement matches the ${EIP3009_TOKENS[input.token ?? "USD1"].symbol} rail`
    } else {
      reconciliation =
        `platform names asset ${first.asset} (scheme ${first.scheme}); this rail settles over ` +
        `${requirement.asset} via EIP-3009. A non-EIP-3009 asset needs the Permit2 path instead, which this rail does not build.`
    }
  }

  let toSign: ReturnType<typeof transferWithAuthorizationTypedData> | null = null
  const requires: string[] = []
  if (input.payer) {
    const now = Math.floor(Date.now() / 1000)
    const authorization: Eip3009Authorization = {
      from: getAddress(input.payer.from),
      to: payTo,
      value: input.amountAtomic,
      validAfter: input.payer.validAfter ?? now - 60,
      validBefore: input.payer.validBefore ?? now + AUTHORIZATION_WINDOW_SECONDS,
      nonce: input.payer.nonce,
    }
    toSign = transferWithAuthorizationTypedData({ token: input.token, authorization })
  } else {
    requires.push("the payer address and a random 32-byte nonce to build the authorization")
  }
  requires.push("the payer's EIP-712 signature over the authorization", "a funded b402 facilitator to submit the settle transaction")

  return {
    requirement,
    platformRequirement,
    reconciliation,
    toSign,
    requires,
    gated: true,
    note: `Prepared a ${X402_VERSION === 2 ? "b402 (x402 v2)" : "x402"} payment of ${input.amountAtomic} atomic units to ${payTo} over ${requirement.asset}. Nothing was signed or settled here.`,
  }
}
