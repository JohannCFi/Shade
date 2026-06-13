/**
 * Circle Nanopayments buyer — live proof on Arc.
 *
 * Deposits a small amount of USDC into the agent's Circle Gateway balance, then
 * pays the x402-protected oracle. Circle verifies the EIP-3009 authorization and
 * settles it gaslessly. This proves the transparent ("x402 nu") rail end-to-end.
 *
 * Run (with the Next server up): npx tsx scripts/circle-pay.ts [oracleUrl]
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { mnemonicToAccount } from "viem/accounts";
import { config } from "../src/unlink/config.js";

const DEPOSIT_USDC = process.env.CIRCLE_DEPOSIT ?? "0.5"; // capped per night guardrail
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3210";
const oracleUrl = process.argv[2] ?? `${BASE_URL}/api/x402/eth?tick=3`;

function buyerPrivateKey(): `0x${string}` {
  if (config.privateKey) return config.privateKey as `0x${string}`;
  const hd = mnemonicToAccount(config.mnemonic).getHdKey();
  return ("0x" + Buffer.from(hd.privateKey!).toString("hex")) as `0x${string}`;
}

async function main() {
  console.log("=== Shade :: Circle nanopayment (live) ===");
  console.log(`chain   = ${config.chain.circleChainName}`);
  console.log(`oracle  = ${oracleUrl}`);

  const gateway = new GatewayClient({
    chain: config.chain.circleChainName,
    privateKey: buyerPrivateKey(),
  });

  const before = await gateway.getBalances();
  console.log(`wallet USDC          = ${before.wallet.formatted}`);
  console.log(`gateway available    = ${before.gateway.formattedAvailable}`);

  if (Number(before.gateway.formattedAvailable) < Number(DEPOSIT_USDC)) {
    console.log(`\nDepositing ${DEPOSIT_USDC} USDC into Gateway…`);
    const dep = await gateway.deposit(DEPOSIT_USDC);
    console.log(`  deposit tx = ${dep.depositTxHash}`);
    const mid = await gateway.getBalances();
    console.log(`  gateway available now = ${mid.gateway.formattedAvailable}`);
  }

  console.log(`\nPaying oracle via Circle…`);
  const result = await gateway.pay(oracleUrl, { method: "GET" });
  console.log(`  HTTP status     = ${result.status}`);
  console.log(`  amount paid     = ${result.formattedAmount} USDC`);
  console.log(`  settlement tx   = ${result.transaction}`);
  console.log(`  oracle data     = ${JSON.stringify(result.data)}`);

  console.log("\n=== ✅ Circle nanopayment settled live ===");
}

main().catch((err) => {
  console.error("\n=== ❌ Circle nanopayment FAILED ===");
  console.error(err);
  process.exit(1);
});
