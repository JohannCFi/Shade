/**
 * Spy engine preview (headless, no UI). Shows what a competitor reconstructs:
 * transparent rail → everything; Unlink rail → nothing. Also proves the chain
 * reader works against real Arc data.
 *
 * Run: npx tsx scripts/spy-demo.ts
 */
import { reconstruct } from "../src/spy/reconstruct.js";
import { readObservablePayments } from "../src/spy/chain-reader.js";
import type { ObservablePayment } from "../src/spy/types.js";
import { config } from "../src/unlink/config.js";

const AGENT = "0xA6E07000000000000000000000000000000000a1";
const OWNER = "0x0000000000000000000000000000000000000001";
const ETH = "0x1111111111111111111111111111111111111111";
const BTC = "0x2222222222222222222222222222222222222222";
const LABELS = { [ETH.toLowerCase()]: "ETH price", [BTC.toLowerCase()]: "BTC signal" };

function transparent(): ObservablePayment[] {
  const p: ObservablePayment[] = [{ from: OWNER, to: AGENT, amount: "5000000" }];
  for (let i = 0; i < 6; i++) {
    p.push({ from: AGENT, to: ETH, amount: "1000" });
    p.push({ from: AGENT, to: BTC, amount: "1000" });
  }
  return p;
}

function show(title: string, r: ReturnType<typeof reconstruct>) {
  console.log(`\n=== ${title} ===`);
  if (!r.readable) {
    console.log("  funder:   ??? 🚫");
    console.log("  oracles:  ??? 🚫 (noise)");
    console.log("  budget:   ??? 🚫");
    console.log("  strategy: unreadable 🚫");
    return;
  }
  console.log(`  funder:   ${r.funder}`);
  console.log(`  oracles:  ${r.oracles.map((o) => `${o.label ?? o.oracle} (${o.calls}×)`).join(", ")}`);
  console.log(`  budget:   ${r.totalSpent} units spent`);
  console.log(`  strategy: "${r.inferredStrategy}"`);
}

async function main() {
  console.log("SHADE — spy engine preview (what a competitor reconstructs)");
  show("LEFT — x402 nu (transparent)", reconstruct({ agentAddress: AGENT, payments: transparent(), knownOracles: LABELS }));
  show("RIGHT — same agent on Unlink", reconstruct({ agentAddress: AGENT, payments: [], knownOracles: LABELS }));

  console.log("\n=== chain reader sanity (real Arc data) ===");
  try {
    const wallet = "0xD1e184435B2266458dAF5A2b458361ed76024089";
    const got = await readObservablePayments({ address: wallet, token: config.testToken, rpcUrl: config.rpcUrl });
    console.log(`  read ${got.length} USDC Transfer(s) touching ${wallet.slice(0, 10)}… on Arc`);
  } catch (e) {
    console.log(`  (chain read skipped: ${(e as Error).message})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
