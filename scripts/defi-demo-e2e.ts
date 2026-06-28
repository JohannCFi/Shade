/**
 * End-to-end check of the /spy demo's DeFi allocation phase, headless (no browser).
 * Mirrors app/api/spy/run-transparent/route.ts:
 *   1. transparent rail: real visible oracle pays + capital allocations (trades)
 *   2. private rail: same oracle pays + allocations via execute() (invisible)
 *   3. spy reconstruction: confirm the transparent agent's venues are LEAKED and
 *      the private rail stays dark.
 *
 * Run: npx tsx scripts/defi-demo-e2e.ts
 */
import { config } from "../src/unlink/config.js";
import { registerDemoVenues, demoVenueLabels } from "../src/defi/demo-registry.js";
import { runTransparentAgentStream } from "../src/spy/transparent-run.js";
import { runPrivatePayments } from "../src/spy/private-run.js";
import { readObservablePayments } from "../src/spy/chain-reader.js";
import { reconstruct } from "../src/spy/reconstruct.js";
import { deriveSpyAddresses, oracleLabels } from "../src/spy/agents.js";

const TICKS = 1;

async function main() {
  const venues = registerDemoVenues();
  console.log(`[demo] configured venues: ${venues.map((v) => `${v.label}(${v.kind})`).join(", ") || "NONE"}`);
  if (venues.length === 0) throw new Error("no DeFi venues configured — set DEFI_* in .env");

  // 1. Transparent rail — real txs. Collect the agent + trade events.
  let agent = "0x0" as `0x${string}`;
  const trades: { label: string; venue: string; hash: string }[] = [];
  console.log("[demo] running transparent rail (real on-chain)...");
  for await (const e of runTransparentAgentStream({
    mnemonic: config.mnemonic,
    token: config.testToken,
    tokenDecimals: config.tokenDecimals,
    environment: config.environment,
    rpcUrl: config.rpcUrl,
    ticks: TICKS,
    venues,
  })) {
    if (e.kind === "start") agent = e.agent;
    if (e.kind === "trade") {
      trades.push({ label: e.label, venue: e.venue, hash: e.hash });
      console.log(`[demo]   transparent trade → ${e.label} @ ${e.venue} (${e.hash})`);
    }
  }

  // 2. Private rail — same allocations via execute().
  console.log("[demo] running private rail (execute, invisible)...");
  const priv = await runPrivatePayments({
    mnemonic: config.mnemonic,
    apiKey: config.apiKey,
    environment: config.environment,
    token: config.testToken,
    rpcUrl: config.rpcUrl,
    ticks: TICKS,
    tokenDecimals: config.tokenDecimals,
    venues,
  });
  console.log(`[demo]   private payments: ${priv.payments}; private DeFi: ${priv.defi.executed}/${priv.defi.attempted}`);
  for (const a of priv.defi.actions) {
    console.log(`[demo]   private DeFi → ${a.label} (${a.primitive}) execAccount=${a.execAccount} status=${a.status}`);
  }

  // 3. Spy reconstruction for the transparent agent — venues must be LEAKED.
  const addrs = deriveSpyAddresses(config.mnemonic);
  const venueLabels = demoVenueLabels(venues);
  const payments = await readObservablePayments({ address: agent, token: config.testToken, rpcUrl: config.rpcUrl });
  const report = reconstruct({ agentAddress: agent, payments, knownOracles: oracleLabels(addrs), knownVenues: venueLabels });

  console.log("\n=== TRANSPARENT RAIL (spy reconstruction) ===");
  console.log(`readable: ${report.readable}`);
  console.log(`oracles:  ${report.oracles.map((o) => o.label ?? o.oracle).join(", ") || "-"}`);
  console.log(`leaked allocations: ${report.allocations.map((a) => `${a.label} ${a.amount}`).join(" · ") || "NONE"}`);
  console.log(`strategy: "${report.inferredStrategy}"`);

  console.log("\n=== PRIVATE RAIL ===");
  console.log(`private DeFi allocations executed: ${priv.defi.executed} (invisible on-chain, fresh ExecutionAccounts)`);

  const leakedOk = report.allocations.length > 0;
  const privateOk = priv.defi.executed > 0;
  console.log(`\n[demo] RESULT: transparent leaks venues = ${leakedOk}; private executed = ${privateOk}`);
  if (!leakedOk) console.warn("[demo] WARNING: no leaked allocations reconstructed (txs may not be indexed yet)");
  process.exit(leakedOk && privateOk ? 0 : 1);
}

main().catch((e) => {
  console.error("[demo] ERROR:", e?.message ?? e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});
