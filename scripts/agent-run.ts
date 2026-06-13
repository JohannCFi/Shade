/**
 * Live agent on Arc — pays REAL oracles on BOTH rails, headless.
 *
 *  - transparent rail: Circle Nanopayments (GatewayClient.pay → x402 HTTP oracle,
 *    settled on-chain, fully visible)
 *  - private rail: Unlink (client.transfer to the oracle's shielded account,
 *    no on-chain agent→seller edge)
 *
 * Each tick it buys an ETH price + a BTC signal and applies its trivial
 * strategy. Spend is capped (--limit) per the night guardrail.
 *
 * Run (Next server up): npx tsx scripts/agent-run.ts [--rail both|circle|unlink] [--ticks N] [--limit USDC]
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { account as unlinkAccount } from "@unlink-xyz/sdk/client";
import { mnemonicToAccount } from "viem/accounts";
import { createNodeUnlinkContext } from "../src/unlink/node-client.js";
import { config, fromBaseUnits, toBaseUnits } from "../src/unlink/config.js";
import { ethPriceAt, btcSignalAt } from "../src/oracle/feed.js";
import { decide, describeStrategy } from "../src/agent/strategy.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RAIL = arg("rail", "both"); // both | circle | unlink
const TICKS = Number(arg("ticks", "2"));
const LIMIT_USDC = Number(arg("limit", "0.05"));
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3210";
const PRICE_UNITS = (10n ** BigInt(Math.max(config.tokenDecimals - 3, 0))).toString(); // 0.001
const PRICE_USDC = Number(fromBaseUnits(PRICE_UNITS));

function buyerPrivateKey(): `0x${string}` {
  if (config.privateKey) return config.privateKey as `0x${string}`;
  const hd = mnemonicToAccount(config.mnemonic).getHdKey();
  return ("0x" + Buffer.from(hd.privateKey!).toString("hex")) as `0x${string}`;
}

let totalSpent = 0;
function within(extra: number): boolean {
  return totalSpent + extra <= LIMIT_USDC + 1e-9;
}

async function main() {
  console.log("=== Shade :: live agent (Arc) ===");
  console.log(`rail=${RAIL} ticks=${TICKS} limit=${LIMIT_USDC} USDC  price/call=${PRICE_USDC} USDC`);
  console.log(`strategy: "${describeStrategy()}"\n`);

  // --- Circle rail setup ---
  let gateway: GatewayClient | null = null;
  if (RAIL === "both" || RAIL === "circle") {
    gateway = new GatewayClient({ chain: config.chain.circleChainName, privateKey: buyerPrivateKey() });
    const b = await gateway.getBalances();
    console.log(`[circle] gateway available = ${b.gateway.formattedAvailable} USDC`);
    const need = PRICE_USDC * TICKS * 2;
    if (Number(b.gateway.formattedAvailable) < need && within(0)) {
      const dep = (Math.max(need, 0.1)).toFixed(3);
      console.log(`[circle] depositing ${dep} USDC into Gateway…`);
      await gateway.deposit(dep);
    }
  }

  // --- Unlink rail setup ---
  let owner: ReturnType<typeof createNodeUnlinkContext> | null = null;
  let ethSellerUnlink = "";
  let btcSellerUnlink = "";
  if (RAIL === "both" || RAIL === "unlink") {
    owner = createNodeUnlinkContext(0);
    await owner.client.ensureRegistered();
    const ethSeller = unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 2 });
    const btcSeller = unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 3 });
    ethSellerUnlink = await ethSeller.getAddress();
    btcSellerUnlink = await btcSeller.getAddress();
    await owner.admin.users.register(await ethSeller.getRegistrationPayload());
    await owner.admin.users.register(await btcSeller.getRegistrationPayload());
    const bal = await owner.client.getBalances({ token: config.testToken });
    const shielded = bal.balances.find((x) => x.token.toLowerCase() === config.testToken.toLowerCase());
    console.log(`[unlink] agent shielded balance (reported) = ${shielded ? fromBaseUnits(shielded.amount) : "0"} USDC`);

    // Deposit a small fresh amount so spendable notes are guaranteed (reported
    // balance can lag post-withdraw). Amount covers this run; capped.
    const fresh = (PRICE_USDC * TICKS * 2 + 0.001).toFixed(6);
    console.log(`[unlink] depositing ${fresh} USDC into the pool (fresh spendable notes)…`);
    const dep = await owner.client.depositWithApproval({ token: config.testToken, amount: toBaseUnits(fresh) });
    await dep.wait();
  }

  let prevEth = 0;
  for (let tick = 0; tick < TICKS; tick++) {
    let ethPrice = ethPriceAt(tick);
    let btcSignal = btcSignalAt(tick);

    if (gateway) {
      if (!within(PRICE_USDC * 2)) { console.log("limit reached, stopping circle"); break; }
      const e = await gateway.pay(`${BASE_URL}/api/x402/eth?tick=${tick}`, { method: "GET" });
      const b = await gateway.pay(`${BASE_URL}/api/x402/btc?tick=${tick}`, { method: "GET" });
      totalSpent += Number(e.formattedAmount) + Number(b.formattedAmount);
      ethPrice = (e.data as { value: number }).value;
      btcSignal = (b.data as { value: typeof btcSignal }).value;
      console.log(`[circle][t${tick}] paid 2× ${PRICE_USDC} (tx ${String(e.transaction).slice(0, 10)}…, ${String(b.transaction).slice(0, 10)}…)`);
    }

    if (owner) {
      if (!within(PRICE_USDC * 2)) { console.log("limit reached, stopping unlink"); break; }
      const t1 = await owner.client.transfer({ token: config.testToken, amount: PRICE_UNITS, recipientAddress: ethSellerUnlink });
      const t2 = await owner.client.transfer({ token: config.testToken, amount: PRICE_UNITS, recipientAddress: btcSellerUnlink });
      await t1.wait(); await t2.wait();
      totalSpent += PRICE_USDC * 2;
      console.log(`[unlink][t${tick}] paid 2× ${PRICE_USDC} privately (no on-chain edge)`);
    }

    const action = decide({ ethPrice, ethPrevPrice: tick === 0 ? ethPrice : prevEth, btcSignal });
    prevEth = ethPrice;
    console.log(`        ETH=${ethPrice} BTC=${btcSignal} → ${action}   [spent ${totalSpent.toFixed(6)} USDC]\n`);
  }

  console.log(`=== ✅ agent run complete — total spent ${totalSpent.toFixed(6)} USDC on rail "${RAIL}" ===`);
}

main().catch((err) => {
  console.error("\n=== ❌ agent run FAILED ===");
  console.error(err);
  process.exit(1);
});
