/**
 * "My trading bot" — simulate a real user plugging THEIR strategy into Shade,
 * using the @shade/pay SDK exactly like the dashboard snippet tells you to.
 *
 * The SDK now derives the bot's private identity from the wallet SIGNATURE — the
 * same way /app deploys it — so this is genuinely "the same bot": deploy + fund
 * in /app with this wallet, then run this; it pays from that private budget and
 * its transfers appear in the dashboard's Activity panel.
 *
 * It has its own strategy (mean-reversion) and pays the oracles PRIVATELY via
 * Unlink — invisible on the public explorer.
 *
 * Run: npx tsx scripts/my-bot.ts [--ticks N]
 */
import "dotenv/config";
import { account as unlinkAccount } from "@unlink-xyz/sdk/client";
import { createShadeAgent } from "../src/sdk/index.js";
import { config } from "../src/unlink/config.js";
import { ethPriceAt, btcSignalAt } from "../src/oracle/feed.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const TICKS = Number(arg("ticks", "4"));
const PRICE = "0.001";

/** MY strategy (not Shade's): mean-reversion around 3000. */
function myStrategy(ethPrice: number, btcSignal: string): "BUY" | "SELL" | "HOLD" {
  if (ethPrice < 2950 && btcSignal !== "bearish") return "BUY";
  if (ethPrice > 3050 && btcSignal !== "bullish") return "SELL";
  return "HOLD";
}

async function main() {
  console.log("=== My trading bot — plugged into Shade (private payments) ===\n");

  // Same wallet you connect in /app = same private bot identity.
  // Use YOUR wallet by setting BOT_WALLET_PRIVATE_KEY (e.g. exported from the
  // wallet you connect in /app) or BOT_WALLET_MNEMONIC in .env; otherwise it
  // falls back to the project's WALLET_MNEMONIC for a quick local test.
  const botPrivateKey = process.env.BOT_WALLET_PRIVATE_KEY;
  const botMnemonic = process.env.BOT_WALLET_MNEMONIC ?? config.mnemonic;
  const shade = createShadeAgent({
    environment: config.environment,
    apiKey: config.apiKey,
    token: config.testToken,
    tokenDecimals: config.tokenDecimals,
    ...(botPrivateKey ? { privateKey: botPrivateKey } : { mnemonic: botMnemonic }),
    rpcUrl: config.rpcUrl,
  });

  await shade.ready();
  console.log(`bot identity (private): ${(await shade.address()).slice(0, 24)}…`);

  // The oracles I pay for data (the same private sellers the demo uses).
  const ethSeller = await unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 2 }).getAddress();
  const btcSeller = await unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 3 }).getAddress();

  // Fund my private budget if it can't cover this run.
  if (Number(await shade.budget()) < Number(PRICE) * TICKS * 2) {
    console.log("funding my private budget (0.05 USDC)…");
    await shade.fundBudget("0.05");
  }
  console.log(`budget: ${await shade.budget()} USDC\n`);

  // One log line per PRIVATE TRANSFER, same `transfer → unlink1…` format as the
  // dashboard's Activity panel — so the line count matches 1:1 on both sides.
  const short = (a: string) => `${a.slice(0, 14)}…`;
  let transfers = 0;
  for (let t = 0; t < TICKS; t++) {
    const ethPrice = ethPriceAt(t);
    const btcSignal = btcSignalAt(t);
    const action = myStrategy(ethPrice, btcSignal);
    console.log(`\n── tick ${t + 1}  ·  ETH=${ethPrice}  BTC=${btcSignal}  →  decision ${action}`);

    await shade.payPrivate(ethSeller, PRICE);
    console.log(`   transfer → ${short(ethSeller)}   ETH price  · ${PRICE} USDC · private`); transfers++;
    await shade.payPrivate(btcSeller, PRICE);
    console.log(`   transfer → ${short(btcSeller)}   BTC signal · ${PRICE} USDC · private`); transfers++;
  }

  console.log(`\nremaining budget: ${await shade.budget()} USDC`);
  console.log(`\n=== ✅ ${transfers} private transfers this run — nothing leaked on-chain ===`);
  console.log(`The same ${transfers} 'transfer → unlink1…' lines appear in /app → Activity (Refresh; newest first).`);
}

main().catch((e) => {
  console.error("\n=== ❌ my-bot FAILED ===");
  console.error((e as Error).message);
  process.exit(1);
});
