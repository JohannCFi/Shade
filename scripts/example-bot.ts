/**
 * Example "bring your own bot" — a bot WE didn't design, plugged into Shade.
 *
 * It has its OWN strategy (mean-reversion, different from the repo's demo agent)
 * and uses the @shade/pay SDK to pay for oracle data PRIVATELY from its own
 * budget via Unlink. A competitor reading the chain reconstructs nothing.
 *
 * Run (server up for seller discovery): npx tsx scripts/example-bot.ts [--ticks N]
 */
import "dotenv/config";
import { account as unlinkAccount } from "@unlink-xyz/sdk/client";
import { createShadeAgent } from "../src/sdk/index.js";
import { ethPriceAt, btcSignalAt } from "../src/oracle/feed.js";

/** Discover oracle payment addresses (from the API), or derive them locally. */
async function getSellers(): Promise<{ eth: string; btc: string }> {
  try {
    const r = await fetch(`${BASE_URL}/api/oracle/sellers`);
    if (r.ok) return await r.json();
  } catch {
    /* server down — fall back to local derivation (demo) */
  }
  const m = process.env.WALLET_MNEMONIC!;
  return {
    eth: await unlinkAccount.fromMnemonic({ mnemonic: m, accountIndex: 2 }).getAddress(),
    btc: await unlinkAccount.fromMnemonic({ mnemonic: m, accountIndex: 3 }).getAddress(),
  };
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const TICKS = Number(arg("ticks", "3"));
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3210";
const PRICE = "0.001";

/** MY strategy (not Shade's): mean-reversion around 3000. */
function myStrategy(ethPrice: number, btcSignal: string): "BUY" | "SELL" | "HOLD" {
  if (ethPrice < 2950 && btcSignal !== "bearish") return "BUY";
  if (ethPrice > 3050 && btcSignal !== "bullish") return "SELL";
  return "HOLD";
}

async function main() {
  console.log("=== My trading bot (powered by Shade private payments) ===");

  const shade = createShadeAgent({
    environment: process.env.UNLINK_ENVIRONMENT ?? "arc-testnet",
    apiKey: process.env.UNLINK_API_KEY!,
    token: process.env.UNLINK_TEST_TOKEN ?? "0x3600000000000000000000000000000000000000",
    tokenDecimals: Number(process.env.UNLINK_TOKEN_DECIMALS ?? "6"),
    mnemonic: process.env.WALLET_MNEMONIC!,
    rpcUrl: process.env.RPC_URL,
  });

  await shade.ready();
  console.log(`my private account: ${(await shade.address()).slice(0, 20)}…`);

  // Discover where to pay (the paid API tells you its payment address).
  const sellers = await getSellers();

  if (Number(await shade.budget()) < Number(PRICE) * TICKS * 2) {
    console.log("funding my private budget (0.05 USDC)…");
    await shade.fundBudget("0.05");
  }
  console.log(`budget: ${await shade.budget()} USDC\n`);

  for (let t = 0; t < TICKS; t++) {
    await shade.payPrivate(sellers.eth, PRICE); // pay ETH oracle privately
    await shade.payPrivate(sellers.btc, PRICE); // pay BTC oracle privately
    const ethPrice = ethPriceAt(t);
    const btcSignal = btcSignalAt(t);
    const action = myStrategy(ethPrice, btcSignal);
    console.log(`t${t}: ETH=${ethPrice} BTC=${btcSignal} → ${action}   (paid privately)`);
  }

  console.log(`\nremaining budget: ${await shade.budget()} USDC`);
  console.log("=== ✅ my own bot ran privately on Shade — nothing leaked on-chain ===");
}

main().catch((e) => { console.error("=== ❌ example-bot FAILED ==="); console.error(e); process.exit(1); });
