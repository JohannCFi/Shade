/**
 * "Bot #2" — a SECOND, independent bot to test the 1-wallet-1-bot model.
 *
 * It uses a DIFFERENT wallet (BOT2_WALLET_PRIVATE_KEY) → so it derives a DIFFERENT
 * Unlink identity with its OWN private budget, completely separate from my-bot.ts.
 * Connect that same wallet in /app and you'll see THIS bot's activity (and only
 * this bot's), proving each wallet maps to its own bot.
 *
 * Different persona: a MOMENTUM strategy (buys strength), vs my-bot's mean-reversion.
 *
 * Setup: put the second wallet's key in .env as BOT2_WALLET_PRIVATE_KEY (0x…),
 * connect that wallet in /app, then run.
 * Run: npx tsx scripts/my-bot-2.ts [--ticks N]
 * Remote mode (no admin key): SHADE_API_URL=http://localhost:3001 npx tsx scripts/my-bot-2.ts
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

/** Bot #2's strategy: MOMENTUM — ride strength, cut weakness. */
function momentum(ethPrice: number, ethPrev: number, btcSignal: string): "BUY" | "SELL" | "HOLD" {
  if (ethPrice > ethPrev && btcSignal === "bullish") return "BUY";
  if (ethPrice < ethPrev && btcSignal === "bearish") return "SELL";
  return "HOLD";
}

async function main() {
  console.log("=== Bot #2 (momentum) — a second wallet, a second bot ===\n");

  const botKey = process.env.BOT2_WALLET_PRIVATE_KEY;
  if (!botKey) {
    console.error("Set BOT2_WALLET_PRIVATE_KEY in .env to the SECOND wallet's private key");
    console.error("(the same wallet you connect in /app for this bot).");
    process.exit(1);
  }

  // A SECOND wallet ⇒ a SECOND, independent bot identity + budget.
  const shade = createShadeAgent({
    environment: config.environment,
    ...(process.env.SHADE_API_URL ? { apiUrl: process.env.SHADE_API_URL } : { apiKey: config.apiKey }),
    token: config.testToken,
    tokenDecimals: config.tokenDecimals,
    privateKey: botKey,
    rpcUrl: config.rpcUrl,
  });

  await shade.ready();
  console.log(`bot #2 identity (private): ${(await shade.address()).slice(0, 24)}…`);

  // Same shared oracles as the demo.
  const ethSeller = await unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 2 }).getAddress();
  const btcSeller = await unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 3 }).getAddress();

  if (Number(await shade.budget()) < Number(PRICE) * TICKS * 2) {
    console.log("funding bot #2's private budget (0.05 USDC)…");
    await shade.fundBudget("0.05");
  }
  console.log(`budget: ${await shade.budget()} USDC\n`);

  const short = (a: string) => `${a.slice(0, 14)}…`;
  let transfers = 0;
  let prevEth = ethPriceAt(0);
  for (let t = 0; t < TICKS; t++) {
    const ethPrice = ethPriceAt(t);
    const btcSignal = btcSignalAt(t);
    const action = momentum(ethPrice, prevEth, btcSignal);
    console.log(`\n── tick ${t + 1}  ·  ETH=${ethPrice}  BTC=${btcSignal}  →  decision ${action}`);

    await shade.payPrivate(ethSeller, PRICE);
    console.log(`   transfer → ${short(ethSeller)}   ETH price  · ${PRICE} USDC · private`); transfers++;
    await shade.payPrivate(btcSeller, PRICE);
    console.log(`   transfer → ${short(btcSeller)}   BTC signal · ${PRICE} USDC · private`); transfers++;
    prevEth = ethPrice;
  }

  console.log(`\nremaining budget: ${await shade.budget()} USDC`);
  console.log(`\n=== ✅ ${transfers} private transfers — bot #2, its own budget, invisible on-chain ===`);
  console.log("(Connect this second wallet in /app → Refresh: you'll see ONLY this bot's activity.)");
}

main().catch((e) => {
  console.error("\n=== ❌ my-bot-2 FAILED ===");
  console.error((e as Error).message);
  process.exit(1);
});
