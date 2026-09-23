// ERC-8183 "Agentic Commerce" Job escrow: the lifecycle model and the UNSIGNED transaction builders
// for create, fund, submit and settle.
//
// ERC-8183 is a DRAFT EIP and NO deployed job-escrow contract was found on chain in this session, so
// this file invents no address: every builder REQUIRES the escrow contract address from the caller and
// refuses without one. The ABI below is a draft MODEL of the primitive the EIP describes (a job that
// moves Open -> Funded -> Submitted -> Completed or Rejected). Its function signatures and selectors
// are UNVERIFIED against any live contract and must be confirmed against the real ERC-8183 deployment
// before any of these transactions is signed. The calldata each builder produces is internally
// consistent (viem encodes it against this ABI), which is a different thing from being correct for a
// specific deployment.
import { getAddress, keccak256, parseAbi, toHex, type Address } from "viem"
import { buildCall, type UnsignedTx } from "./tx.js"

// The five states of the ERC-8183 job primitive, in order. A job opens, gets funded into escrow, the
// worker submits a deliverable, then the client settles it to Completed (funds released to the worker)
// or Rejected (funds refunded to the client).
export const JOB_STATES = ["Open", "Funded", "Submitted", "Completed", "Rejected"] as const
export type JobState = (typeof JOB_STATES)[number]

// The transitions the lifecycle allows. Used to validate a proposed action against a job's current
// state before building its transaction, so a "submit" against an unfunded job fails here rather than
// on chain.
export const JOB_TRANSITIONS: Record<JobState, JobState[]> = {
  Open: ["Funded"],
  Funded: ["Submitted", "Rejected"],
  Submitted: ["Completed", "Rejected"],
  Completed: [],
  Rejected: [],
}

export function canTransition(from: JobState, to: JobState): boolean {
  return JOB_TRANSITIONS[from].includes(to)
}

export interface Job {
  jobId: string
  client: Address
  worker: Address
  paymentToken: Address
  // Escrow amount in atomic units of paymentToken, as a decimal string.
  amount: string
  state: JobState
  // keccak256 over the canonical job spec, so both sides agree on what was commissioned.
  specHash: `0x${string}`
  // keccak256 over the delivered result, set when the worker submits.
  resultHash?: `0x${string}`
}

// A draft MODEL of the ERC-8183 job-escrow interface. UNVERIFIED: confirm against the real contract
// before signing. The names follow the lifecycle the EIP describes.
export const JOB_ABI = parseAbi([
  "function createJob(address worker, address paymentToken, uint256 amount, bytes32 specHash) returns (uint256 jobId)",
  "function fundJob(uint256 jobId, uint256 amount)",
  "function submitResult(uint256 jobId, bytes32 resultHash)",
  "function settleJob(uint256 jobId, bool accept, string reason)",
  "function getJob(uint256 jobId) view returns (address client, address worker, address paymentToken, uint256 amount, uint8 state, bytes32 specHash, bytes32 resultHash)",
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed worker, uint256 amount)",
  "event JobFunded(uint256 indexed jobId, uint256 amount)",
  "event JobSubmitted(uint256 indexed jobId, bytes32 resultHash)",
  "event JobSettled(uint256 indexed jobId, bool accepted)",
])

// Stable hash of a job spec or deliverable, so both sides commit to the same bytes. Keys are sorted at
// every depth and non-ASCII is escaped, matching the canonicalisation the BNB Chain and Altana SDKs
// ship for the ERC-8183 negotiation hash, so a hash computed here matches one computed in Python.
function canonicalJson(value: unknown): string {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys)
    if (v !== null && typeof v === "object") {
      const src = v as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(src).sort()) out[k] = sortKeys(src[k])
      return out
    }
    return v
  }
  const s = JSON.stringify(sortKeys(value))
  let escaped = ""
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    escaped += code < 0x80 ? s[i] : "\\u" + code.toString(16).padStart(4, "0")
  }
  return escaped
}

export function hashJobPayload(payload: unknown): `0x${string}` {
  return keccak256(toHex(canonicalJson(payload)))
}

const ESCROW_REQUIRED = "the ERC-8183 escrow contract address (none is deployed-and-verified, so it must be supplied)"

// Open a job: the client names the worker, the payment token and the amount, then commits to a spec by
// its hash. Returns an UNSIGNED transaction, never sent.
export function buildCreateJobTx(input: {
  escrow: Address
  worker: Address
  paymentToken: Address
  amount: string
  spec: unknown | `0x${string}`
}): UnsignedTx {
  const specHash =
    typeof input.spec === "string" && /^0x[0-9a-fA-F]{64}$/.test(input.spec)
      ? (input.spec as `0x${string}`)
      : hashJobPayload(input.spec)
  return buildCall({
    action: "ERC-8183 createJob",
    to: input.escrow,
    abi: JOB_ABI,
    functionName: "createJob",
    args: [getAddress(input.worker), getAddress(input.paymentToken), BigInt(input.amount), specHash],
    signature: "createJob(address worker, address paymentToken, uint256 amount, bytes32 specHash) returns (uint256 jobId)",
    requires: [ESCROW_REQUIRED, "a signer for the client wallet", "BNB for gas"],
    note: "Opens a job in state Open, committing to the worker, token, amount and spec hash. Emits JobCreated with the new jobId.",
  })
}

// Fund a job into escrow. The escrow pulls `amount` of the payment token, so the client must have run
// approve(escrow, amount) on that token first. Moves Open -> Funded.
export function buildFundJobTx(input: { escrow: Address; jobId: string; amount: string }): UnsignedTx {
  return buildCall({
    action: "ERC-8183 fundJob",
    to: input.escrow,
    abi: JOB_ABI,
    functionName: "fundJob",
    args: [BigInt(input.jobId), BigInt(input.amount)],
    signature: "fundJob(uint256 jobId, uint256 amount)",
    requires: [ESCROW_REQUIRED, "a prior approve(escrow, amount) on the payment token", "a signer for the client wallet", "BNB for gas"],
    note: "Funds the job escrow, moving Open -> Funded. The escrow pulls the token via transferFrom, so an allowance must already exist.",
  })
}

// Submit the deliverable's hash. Moves Funded -> Submitted. Signed by the worker.
export function buildSubmitJobTx(input: { escrow: Address; jobId: string; result: unknown | `0x${string}` }): UnsignedTx {
  const resultHash =
    typeof input.result === "string" && /^0x[0-9a-fA-F]{64}$/.test(input.result)
      ? (input.result as `0x${string}`)
      : hashJobPayload(input.result)
  return buildCall({
    action: "ERC-8183 submitResult",
    to: input.escrow,
    abi: JOB_ABI,
    functionName: "submitResult",
    args: [BigInt(input.jobId), resultHash],
    signature: "submitResult(uint256 jobId, bytes32 resultHash)",
    requires: [ESCROW_REQUIRED, "a signer for the worker wallet", "BNB for gas"],
    note: "Records the deliverable hash, moving Funded -> Submitted. The hash lets the client verify the result off chain before settling.",
  })
}

// Settle a submitted job: accept to release escrow to the worker (Completed) or reject to refund the
// client (Rejected). Signed by the client. `accept` is the discriminator, not the reason string.
export function buildSettleJobTx(input: { escrow: Address; jobId: string; accept: boolean; reason?: string }): UnsignedTx {
  return buildCall({
    action: input.accept ? "ERC-8183 settleJob (accept)" : "ERC-8183 settleJob (reject)",
    to: input.escrow,
    abi: JOB_ABI,
    functionName: "settleJob",
    args: [BigInt(input.jobId), input.accept, input.reason ?? ""],
    signature: "settleJob(uint256 jobId, bool accept, string reason)",
    requires: [ESCROW_REQUIRED, "a signer for the client wallet", "BNB for gas"],
    note: input.accept
      ? "Accepts the deliverable, releasing the escrowed amount to the worker. Moves Submitted -> Completed."
      : "Rejects the deliverable, refunding the escrowed amount to the client. Moves Submitted -> Rejected.",
  })
}
