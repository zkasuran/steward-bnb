// The one shape every on-chain write in this package produces: an UNSIGNED transaction request.
// Nothing here signs, funds or broadcasts. A builder returns the exact calldata a human (or the
// Agent Studio runtime, once funded) would submit from the house wallet, plus a plain-English note
// of what it does. The `gated` flag is a compile-time reminder that this object is a description of a
// transaction, never a sent one: this package holds no key and spends no gas.
import { encodeFunctionData, getAddress, type Abi, type Address } from "viem"
import { BSC_CHAIN_ID } from "./constants.js"

export interface UnsignedTx {
  // Human-readable label for the call, e.g. "ERC-8004 register(agentURI)".
  action: string
  chainId: number
  to: Address
  // ABI-encoded calldata. Empty ("0x") only for a plain value transfer, which this package never builds.
  data: `0x${string}`
  // Wei as a hex quantity. Always "0x0" here: every builder is a token or registry call, never a
  // native-value send.
  value: `0x${string}`
  // The function signature the calldata encodes, so a reviewer can read what will run without decoding.
  signature: string
  // What the caller still has to supply before this can go on chain (a signer, gas, a real amount).
  requires: string[]
  // A short account of the state change, for the plan a human reads before signing.
  note: string
  // Always true. This object is built to be reviewed and signed elsewhere, never sent from here.
  gated: true
}

export interface BuildCallInput {
  action: string
  to: Address
  abi: Abi
  functionName: string
  args: readonly unknown[]
  signature: string
  note: string
  requires?: string[]
  chainId?: number
}

// Encode one contract call into an UnsignedTx. The encoding is real (viem's encodeFunctionData against
// the given ABI), so the calldata is exactly what the chain would execute. Sending it is the caller's
// step, behind a key and gas this package deliberately does not have.
export function buildCall(input: BuildCallInput): UnsignedTx {
  const data = encodeFunctionData({
    abi: input.abi,
    functionName: input.functionName,
    args: input.args as unknown[],
  })
  return {
    action: input.action,
    chainId: input.chainId ?? BSC_CHAIN_ID,
    to: getAddress(input.to),
    data,
    value: "0x0",
    signature: input.signature,
    requires: input.requires ?? ["a signer for the house wallet", "BNB for gas"],
    note: input.note,
    gated: true,
  }
}
