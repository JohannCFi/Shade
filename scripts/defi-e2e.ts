/**
 * End-to-end private-DeFi run for the vault4626 primitive:
 *   reserve(fresh) -> resolve EA address -> execute(approve+deposit+approvePermit2)
 *   -> depositBack(shares) into the private pool.
 *
 * Prerequisites:
 *   - A deployed gateless ERC-4626 vault over the test token (see
 *     scripts/deploy-mock-vault.ts). Pass it via VAULT_ADDRESS.
 *   - A funded private budget in the test token.
 *
 * Run: VAULT_ADDRESS=0x... npx tsx scripts/defi-e2e.ts
 */
import { createPublicClient, http } from "viem";
import { createNodeUnlinkContext } from "../src/unlink/node-client.js";
import { config } from "../src/unlink/config.js";
import { fromBaseUnits } from "../src/unlink/units.js";
import { register } from "../src/defi/registry.js";
import { runPrivateDefi } from "../src/defi/run.js";
import { makeExecAccountResolver } from "../src/defi/execution-account.js";

const VAULT = process.env.VAULT_ADDRESS as `0x${string}` | undefined;
const AMOUNT_HUMAN = process.env.DEFI_AMOUNT ?? "0.1";

async function main() {
  if (!VAULT) throw new Error("set VAULT_ADDRESS=0x... (deploy via scripts/deploy-mock-vault.ts)");

  const { client, account } = createNodeUnlinkContext();
  await client.ensureRegistered();
  const publicClient = createPublicClient({ chain: config.chain.viemChain, transport: http(config.rpcUrl) });

  const before = await client.getBalances({ token: config.testToken });
  const beforeAmt = before.balances.find((b: any) => b.token.toLowerCase() === config.testToken.toLowerCase());
  console.log(`[e2e] private budget before: ${beforeAmt ? fromBaseUnits(beforeAmt.amount, config.tokenDecimals) : "0"} USDC`);

  register("e2e-vault", {
    kind: "vault4626",
    cfg: { vault: VAULT, asset: config.testToken as `0x${string}`, requiresUngatedVault: true },
  });

  const resolver = makeExecAccountResolver({ client: client as any, account, chainId: config.chain.chainId });
  const amount = BigInt(
    Math.round(Number(AMOUNT_HUMAN) * 10 ** config.tokenDecimals),
  );

  console.log(`[e2e] running vault4626 deposit of ${AMOUNT_HUMAN} into ${VAULT} ...`);
  const res = await runPrivateDefi(client as any, publicClient as any, "e2e-vault", {
    token: config.testToken as `0x${string}`,
    amount,
    slippageBps: 100,
    execAccountResolver: resolver,
  });

  console.log(`[e2e] execAccount: ${res.execAccount}`);
  console.log(`[e2e] minOut (shares deposited back): ${res.minOut}`);
  console.log(`[e2e] execute result:`, JSON.stringify(res.result, null, 2));

  // The vault shares are the deposit-back token; confirm they landed in the private pool.
  const after = await client.getBalances({ token: VAULT });
  const shareBal = after.balances.find((b: any) => b.token.toLowerCase() === VAULT.toLowerCase());
  console.log(`[e2e] private vault-share balance after: ${shareBal?.amount ?? "0"}`);
  console.log("[e2e] DONE.");
}

main().catch((e) => {
  console.error("[e2e] ERROR:", e?.message ?? e);
  if (e?.execAccount) console.error("[e2e] funds may be in ExecutionAccount:", e.execAccount);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});
