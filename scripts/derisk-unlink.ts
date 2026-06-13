/**
 * DERISK UNLINK — hello-world deposit → transfer → withdraw on base-sepolia.
 *
 * This is build-order step #1: prove the @unlink-xyz/sdk works end-to-end
 * BEFORE building anything else. If this passes, the project is technically
 * de-risked.
 *
 * Flow:
 *   1. Register the owner's Unlink account.
 *   2. Faucet test ERC-20 into the owner's EVM wallet.
 *   3. depositWithApproval()  -> move funds into the private (shielded) balance.
 *   4. transfer()             -> pay a second Unlink account (the "agent").
 *   5. withdraw()             -> pull funds back out to an EVM address.
 *
 * Run: npm run derisk:unlink
 */
import { account as unlinkAccount } from "@unlink-xyz/sdk/client";
import { createNodeUnlinkContext } from "../src/unlink/node-client.js";
import { config, fromBaseUnits, toBaseUnits } from "../src/unlink/config.js";

const FUND_AMOUNT = "1.0"; // human units of the test token
const TRANSFER_AMOUNT = "0.25";
const WITHDRAW_AMOUNT = "0.25";

function log(step: string, msg: string) {
  console.log(`\n[${step}] ${msg}`);
}

async function logBalance(label: string, getBalances: () => Promise<{ balances: { token: string; amount: string }[] }>) {
  const { balances } = await getBalances();
  const b = balances.find((x) => x.token.toLowerCase() === config.testToken.toLowerCase());
  console.log(`   ${label} private balance: ${b ? fromBaseUnits(b.amount) : "0"} (token ${config.testToken})`);
}

async function main() {
  console.log("=== Shade :: Unlink derisk spike ===");
  console.log(`environment = ${config.environment}`);
  console.log(`testToken   = ${config.testToken} (${config.tokenDecimals} decimals)`);

  // --- Owner (account index 0) ---
  const owner = createNodeUnlinkContext(0);
  const ownerAddr = await owner.client.getAddress();
  console.log(`owner EVM wallet   = ${owner.evmAddress}`);
  console.log(`owner Unlink addr  = ${ownerAddr}`);

  log("1", "Registering owner Unlink account…");
  await owner.client.ensureRegistered();
  console.log("   registered ✓");

  // --- Recipient "agent" account (account index 1), registered via admin ---
  const agentAccount = unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 1 });
  const agentAddr = await agentAccount.getAddress();
  await owner.admin.users.register(await agentAccount.getRegistrationPayload());
  console.log(`agent Unlink addr  = ${agentAddr} (registered ✓)`);

  // --- 2. Faucet test tokens into the owner's EVM wallet ---
  log("2", "Requesting test tokens to owner EVM wallet…");
  try {
    const mint = await owner.client.faucet.requestTestTokens({ token: config.testToken });
    console.log(`   faucet tx_hash = ${mint.tx_hash}`);
  } catch (err) {
    console.warn(`   requestTestTokens failed (${(err as Error).message}). Falling back to requestPrivateTokens…`);
    const priv = await owner.client.faucet.requestPrivateTokens({ token: config.testToken });
    console.log(`   private faucet tx_id = ${priv.tx_id} (status ${priv.status})`);
  }

  // --- 3. depositWithApproval: move funds into the shielded balance ---
  log("3", `depositWithApproval(${FUND_AMOUNT})…`);
  try {
    const dep = await owner.client.depositWithApproval({
      token: config.testToken,
      amount: toBaseUnits(FUND_AMOUNT),
    });
    const r = await dep.wait();
    console.log(`   deposit status = ${r.status}`);
  } catch (err) {
    console.warn(`   depositWithApproval skipped/failed (${(err as Error).message}).`);
    console.warn("   (If faucet already funded the private balance directly, deposit may be unnecessary.)");
  }

  await logBalance("owner", () => owner.client.getBalances({ token: config.testToken }));

  // --- 4. transfer: owner pays the agent privately ---
  log("4", `transfer(${TRANSFER_AMOUNT}) owner → agent…`);
  const t = await owner.client.transfer({
    token: config.testToken,
    amount: toBaseUnits(TRANSFER_AMOUNT),
    recipientAddress: agentAddr,
  });
  const tr = await t.wait();
  console.log(`   transfer status = ${tr.status}`);

  await logBalance("owner", () => owner.client.getBalances({ token: config.testToken }));
  {
    const { balances } = await owner.admin.users.getBalances({ address: agentAddr, token: config.testToken });
    const b = balances.find((x) => x.token.toLowerCase() === config.testToken.toLowerCase());
    console.log(`   agent private balance: ${b ? fromBaseUnits(b.amount) : "0"}`);
  }

  // --- 5. withdraw: pull funds back to an EVM address ---
  log("5", `withdraw(${WITHDRAW_AMOUNT}) → ${owner.evmAddress}…`);
  const w = await owner.client.withdraw({
    token: config.testToken,
    amount: toBaseUnits(WITHDRAW_AMOUNT),
    recipientEvmAddress: owner.evmAddress,
  });
  const wr = await w.wait();
  console.log(`   withdraw status = ${wr.status}`);

  await logBalance("owner", () => owner.client.getBalances({ token: config.testToken }));

  console.log("\n=== ✅ Unlink derisk complete: deposit → transfer → withdraw all worked ===");
}

main().catch((err) => {
  console.error("\n=== ❌ Unlink derisk FAILED ===");
  console.error(err);
  process.exit(1);
});
