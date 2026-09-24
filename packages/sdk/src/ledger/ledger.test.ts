// Deterministic unit tests for the ledger core: FIFO lot reconstruction with realized PnL and open
// basis, plus balance-vs-transfers corporate-action detection. Synthetic transfers and a synthetic
// PriceFn, so there is no RPC and the arithmetic is fully reproducible.
import { test } from "node:test"
import assert from "node:assert/strict"
import type { Address, Hash } from "viem"
import { reconstructLots } from "./lots.js"
import { detectCorporateActions } from "./corporate-actions.js"
import type { PriceFn, TransferRecord } from "./types.js"

const TOKEN = "0x00000000000000000000000000000000000000a1" as Address
const CP = "0x00000000000000000000000000000000000000b2" as Address
const HASH = ("0x" + "1".repeat(64)) as Hash
const DEC = 18
const ONE = 10n ** BigInt(DEC)

let seq = 0
function tr(direction: "in" | "out", tokens: number, block: number): TransferRecord {
  return {
    direction,
    counterparty: CP,
    units: BigInt(tokens) * ONE,
    blockNumber: BigInt(block),
    txHash: HASH,
    logIndex: seq++,
  }
}

// USDT-raw (18dp) per whole token, keyed by block.
const PRICES: Record<string, bigint> = { "1": 100n * ONE, "2": 120n * ONE, "3": 150n * ONE }
const priceFn: PriceFn = ({ blockNumber }) => PRICES[blockNumber.toString()] ?? null

test("FIFO consumes oldest lots first and realizes proceeds minus basis", async () => {
  const transfers = [tr("in", 10, 1), tr("in", 10, 2), tr("out", 15, 3)]
  const r = await reconstructLots(TOKEN, transfers, DEC, priceFn)
  assert.equal(r.lots.length, 2)
  assert.equal(r.totalAcquiredUnits, 20n * ONE)
  assert.equal(r.totalDisposedUnits, 15n * ONE)
  assert.equal(r.openUnits, 5n * ONE)
  // 10 sold from lot1 at (150-100), 5 from lot2 at (150-120) = 500 + 150 = 650 USDT.
  assert.equal(r.realizedPnlUsdt, 650n * ONE)
  // 5 open units of lot2 still valued at 120 = 600 USDT.
  assert.equal(r.costBasisUsdt, 600n * ONE)
  assert.equal(r.valued, true)
})

test("without a PriceFn the units are tracked but the USDT legs stay undefined", async () => {
  const transfers = [tr("in", 10, 1), tr("in", 10, 2), tr("out", 15, 3)]
  const r = await reconstructLots(TOKEN, transfers, DEC)
  assert.equal(r.openUnits, 5n * ONE)
  assert.equal(r.totalAcquiredUnits, 20n * ONE)
  assert.equal(r.valued, false)
  assert.equal(r.realizedPnlUsdt, undefined)
  assert.equal(r.costBasisUsdt, undefined)
})

test("selling more than was ever received drops the excess from FIFO and leaves nothing open", async () => {
  const transfers = [tr("in", 5, 1), tr("out", 8, 2)]
  const r = await reconstructLots(TOKEN, transfers, DEC, priceFn)
  assert.equal(r.openUnits, 0n)
  assert.equal(r.totalAcquiredUnits, 5n * ONE)
  assert.equal(r.totalDisposedUnits, 8n * ONE)
})

test("a positive unexplained balance gap yields exactly one rebase-credit event", () => {
  const events = detectCorporateActions({
    token: TOKEN,
    symbol: "AAPLB",
    decimals: DEC,
    netFromTransfers: 100n * ONE,
    liveBalance: 105n * ONE,
    detectedAtBlock: 123n,
  })
  assert.equal(events.length, 1)
  assert.equal(events[0].kind, "rebase_credit")
  assert.equal(events[0].unexplainedUnits, 5n * ONE)
  assert.equal(events[0].approxPercent, 5)
  assert.match(events[0].explanation, /AAPLB/)
})

test("no gap between live balance and transfer history yields no event", () => {
  const events = detectCorporateActions({
    token: TOKEN,
    symbol: "AAPLB",
    decimals: DEC,
    netFromTransfers: 100n * ONE,
    liveBalance: 100n * ONE,
    detectedAtBlock: 123n,
  })
  assert.equal(events.length, 0)
})

test("a negative gap (balance below transfers) yields no event", () => {
  const events = detectCorporateActions({
    token: TOKEN,
    symbol: "AAPLB",
    decimals: DEC,
    netFromTransfers: 100n * ONE,
    liveBalance: 90n * ONE,
    detectedAtBlock: 123n,
  })
  assert.equal(events.length, 0)
})
