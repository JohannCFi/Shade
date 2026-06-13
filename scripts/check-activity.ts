/**
 * Verify (via the Unlink engine — the owner/admin's private view) that the
 * agent actually paid the oracles. The agent→oracle transfers are NOT on the
 * public explorer (that's the point); they're verifiable here.
 *
 * Run: npx tsx scripts/check-activity.ts
 */
import { createUnlinkAdmin } from "@unlink-xyz/sdk/admin";
import { account as unlinkAccount } from "@unlink-xyz/sdk/client";
import { buildDeriveSeedMessage } from "@unlink-xyz/sdk/crypto";
import { mnemonicToAccount } from "viem/accounts";
import { config, fromBaseUnits } from "../src/unlink/config.js";
import { UNLINK_APP_ID } from "../src/unlink/browser-client.js";

async function main() {
  const admin = createUnlinkAdmin({ environment: config.environment, apiKey: config.apiKey });
  const signer = mnemonicToAccount(config.mnemonic);

  // Same derivation the browser uses, so we land on the same agent account.
  const message = buildDeriveSeedMessage({ appId: UNLINK_APP_ID, chainId: config.chain.chainId });
  const signature = await signer.signMessage({ message });
  const agent = unlinkAccount.fromEthereumSignature({ signature, appId: UNLINK_APP_ID, chainId: config.chain.chainId });
  const agentAddr = await agent.getAddress();

  const ethSeller = await unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 2 }).getAddress();
  const btcSeller = await unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 3 }).getAddress();

  console.log("=== Agent (your private view) ===");
  console.log(`agent: ${agentAddr.slice(0, 24)}…`);
  const bal = await admin.users.getBalances({ address: agentAddr, token: config.testToken });
  const ab = bal.balances.find((x) => x.token.toLowerCase() === config.testToken.toLowerCase());
  console.log(`agent budget left: ${ab ? fromBaseUnits(ab.amount) : "0"} USDC`);

  const txs = await admin.users.getTransactions({ address: agentAddr, limit: 10 });
  console.log(`recent agent transactions (${txs.transactions.length}):`);
  for (const t of txs.transactions.slice(0, 8)) {
    console.log(`  - ${t.type ?? "?"} ${t.status ?? ""}`);
  }

  console.log("\n=== Oracle sellers received (proof the private payments landed) ===");
  for (const [name, addr] of [["ETH", ethSeller], ["BTC", btcSeller]] as const) {
    const b = await admin.users.getBalances({ address: addr, token: config.testToken });
    const x = b.balances.find((y) => y.token.toLowerCase() === config.testToken.toLowerCase());
    console.log(`  ${name} oracle: ${x ? fromBaseUnits(x.amount) : "0"} USDC`);
  }

  console.log("\nNote: these transfers are NOT individually visible on the Arc explorer — only here, via the engine.");
}

main().catch((e) => { console.error(e); process.exit(1); });
