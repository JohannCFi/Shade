/**
 * De-risk probe for the private-DeFi E2E: does the Unlink execute() infrastructure
 * (ExecutionAccount reservation) respond for our seed-backed account on the active
 * environment? One cheap call — no funds moved, no contract deployed.
 *
 * Run: npx tsx scripts/defi-reserve-probe.ts
 */
import { createNodeUnlinkContext } from "../src/unlink/node-client.js";
import { config } from "../src/unlink/config.js";
import { makeExecAccountResolver } from "../src/defi/execution-account.js";

async function main() {
  console.log(`[probe] environment=${config.environment} chainId=${config.chain.chainId}`);
  const { client, account } = createNodeUnlinkContext();
  await client.ensureRegistered();
  console.log(`[probe] unlink address: ${await client.getAddress()}`);

  const anyClient = client as any;
  if (!anyClient.executionAccounts?.reserve) {
    console.error("[probe] FAIL: client.executionAccounts.reserve is not available in this SDK build");
    process.exit(2);
  }

  console.log("[probe] reserving a FRESH ExecutionAccount...");
  const exec = await anyClient.executionAccounts.reserve({ policy: "fresh" });
  console.log("[probe] OK reserve() returned:");
  console.log(JSON.stringify(exec, null, 2));

  // Resolve the CREATE2-predicted EA address client-side (no funds moved) — this
  // exercises the exact path the runner uses when reserve() omits account_address.
  const resolver = makeExecAccountResolver({
    client: client as any,
    account,
    chainId: config.chain.chainId,
  });
  const execAccount = await resolver(exec);
  console.log(`[probe] resolved ExecutionAccount address: ${execAccount}`);
  console.log(`[probe] account_index=${exec.account_index} (reserve account_address=${exec.account_address ?? "null"})`);

  // Sanity: re-resolving the same indices is deterministic.
  const again = await resolver(exec);
  if (again !== execAccount) {
    console.error("[probe] FAIL: address resolution is non-deterministic");
    process.exit(2);
  }
  console.log("[probe] SUCCESS — execute() infra live + EA address resolver works against canary env.");
}

main().catch((err) => {
  console.error("[probe] ERROR:", err?.message ?? err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
