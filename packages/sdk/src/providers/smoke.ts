// Providers smoke test, run against BSC mainnet. Free reads only, no key, no transaction, no spend.
// Proves the Ondo MINTER_ROLE bind holds for the five Ondo equities, the bStocks beacon holds for the
// deep names, the scam clone fails BOTH family checks, the xStock heuristic matches TSLAx and that
// compareProviders returns an honest comparison whose arbitrageExecutable is a literal false with the
// bStocks leg priced and tradeable while Ondo/xStocks are not. Exits nonzero on any failed check.
import { isGenuineBStock } from "../chain/bstocks.js"
import { withRpc } from "../market/index.js"
import { KNOWN_SCAM_CLONE } from "../chain/constants.js"
import { compareProviders, isOndoToken, isXStock } from "./index.js"
import type { Address } from "viem"

const ONDO: Record<string, Address> = {
  AAPLon: "0x390a684EF9cADE28A7AD0DFa61AB1Eb3842618c4",
  TSLAon: "0x2494b603319d4D9F9715c9f4496d9E0364B59d93",
  NVDAon: "0xA9eE28C80f960B889dFbd1902055218cBa016F75",
  GLDon: "0xfA9a1E901085e269f6D428F79Cd5252d8b919344",
  SPYon: "0x6a708EAD771238919D85930b5a0f10454E1C331a",
}
const BSTOCK: Record<string, Address> = {
  TSLAB: "0x5b1910eAaD6450E50f816082Aa078C41F10C292f",
  NVDAB: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436",
}
const TSLAX: Address = "0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0"

async function main() {
  let failures = 0

  await withRpc(async (client) => {
    console.log("--- Ondo MINTER_ROLE bind (live) ---")
    for (const [sym, addr] of Object.entries(ONDO)) {
      const ok = await isOndoToken(client, addr)
      console.log(`  ${sym} ${addr}: isOndoToken=${ok}`)
      if (!ok) failures++
    }

    console.log("--- bStocks beacon (live) ---")
    for (const [sym, addr] of Object.entries(BSTOCK)) {
      const ok = await isGenuineBStock(client, addr)
      console.log(`  ${sym} ${addr}: isGenuineBStock=${ok}`)
      if (!ok) failures++
    }

    console.log("--- xStock heuristic (live) ---")
    const xok = await isXStock(client, TSLAX)
    console.log(`  TSLAx ${TSLAX}: isXStock=${xok}`)
    if (!xok) failures++

    console.log("--- scam clone must fail BOTH family checks (live) ---")
    const scamBstock = await isGenuineBStock(client, KNOWN_SCAM_CLONE)
    const scamOndo = await isOndoToken(client, KNOWN_SCAM_CLONE)
    console.log(`  ${KNOWN_SCAM_CLONE}: isGenuineBStock=${scamBstock} isOndoToken=${scamOndo}`)
    if (scamBstock || scamOndo) failures++
  })

  for (const underlying of ["TSLA", "NVDA"]) {
    console.log(`\n--- compareProviders("${underlying}") (live) ---`)
    const cmp = await compareProviders(underlying)
    if (cmp.arbitrageExecutable !== false) {
      console.error("  FAILED: arbitrageExecutable is not false")
      failures++
    }
    for (const r of cmp.representations) {
      const price = r.spotUsdt === null ? "no v3 USDT pool" : `$${r.spotUsdt.toFixed(2)}`
      console.log(
        `  ${r.family.padEnd(8)} ${r.symbol ?? "?"} authentic=${r.authentic} spot=${price} ` +
          `tradeable=${r.tradeable} depth=${r.depth}`,
      )
    }
    const b = cmp.representations.find((r) => r.family === "bStocks")
    if (!b || !b.authentic || b.spotUsdt === null || !b.tradeable) {
      console.error(`  FAILED: bStocks leg for ${underlying} should be authentic, priced and tradeable`)
      failures++
    }
    if (cmp.representations.some((r) => r.family !== "bStocks" && r.tradeable)) {
      console.error(`  FAILED: a non-bStocks leg for ${underlying} is marked tradeable`)
      failures++
    }
  }

  if (failures > 0) {
    console.error(`\nPROVIDERS SMOKE FAILED: ${failures} failure(s).`)
    process.exit(1)
  }
  console.log("\nPROVIDERS SMOKE OK: family binds hold, scam fails both, comparison is honest.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
