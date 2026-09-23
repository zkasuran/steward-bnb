// Phase 1 smoke test, run against BSC mainnet. Proves the authenticity check DISCRIMINATES:
// the known-genuine bStocks tokens must pass the beacon check, and the known scam clone must
// fail it. A check that passes everything proves nothing, so this exits nonzero if either the
// genuine set fails or the scam clone passes.
import { formatUnits, getAddress } from "viem"
import { makeClient, readBeacon, isGenuineBStock, readTokenMeta } from "./bstocks.js"
import { BSTOCKS_BEACON, BSTOCKS_CANDIDATES, KNOWN_SCAM_CLONE } from "./constants.js"

async function main() {
  const client = makeClient()
  const chainId = await client.getChainId()
  const block = await client.getBlockNumber()
  console.log(`BSC chain ${chainId}, block ${block}`)
  console.log(`known bStocks beacon: ${getAddress(BSTOCKS_BEACON)}\n`)

  let failures = 0

  console.log("candidate                         genuine  beacon-slot points at            symbol / name / supply")
  for (const [label, address] of Object.entries(BSTOCKS_CANDIDATES)) {
    const beacon = await readBeacon(client, address)
    const genuine = await isGenuineBStock(client, address)
    let detail = ""
    if (genuine) {
      const m = await readTokenMeta(client, address)
      detail = `${m.symbol} / ${m.name} / ${Number(formatUnits(m.totalSupply, m.decimals)).toLocaleString()}`
    }
    console.log(
      `${label.padEnd(16)} ${address}  ${genuine ? "yes" : "NO "}    ${(beacon ?? "none").padEnd(30)}   ${detail}`,
    )
    // AAPLB and NVDAB were re-derived on chain in this lane, so they MUST resolve genuine.
    if ((label === "AAPLB" || label === "NVDAB") && !genuine) failures++
  }

  // The scam clone MUST fail the check.
  const scamBeacon = await readBeacon(client, KNOWN_SCAM_CLONE)
  const scamGenuine = await isGenuineBStock(client, KNOWN_SCAM_CLONE)
  console.log(`\nscam clone ${KNOWN_SCAM_CLONE}`)
  console.log(`  beacon slot: ${scamBeacon ?? "none"}`)
  console.log(`  passes authenticity: ${scamGenuine ? "YES (BAD, check is broken)" : "no (correct, rejected)"}`)
  if (scamGenuine) failures++

  if (failures > 0) {
    console.error(`\nSMOKE FAILED: ${failures} discrimination failure(s).`)
    process.exit(1)
  }
  console.log("\nSMOKE OK: genuine bStocks tokens pass, the scam clone is rejected.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
