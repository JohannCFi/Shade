/**
 * Generate REAL transparent on-chain activity, then spy on it from the chain.
 *
 * A fresh "transparent agent" EOA is funded (visible funder→agent edge) and pays
 * the oracles with DIRECT USDC transfers (visible Transfer logs). Then the spy
 * reads the chain and reconstructs everything — from real Arc data, not samples.
 * This is the LEFT half of the split-screen, for real.
 *
 * (The Unlink rail does the same economically but via private transfers, so the
 * same chain read would reconstruct nothing — see scripts/check-activity.ts.)
 *
 * Run: npx tsx scripts/spy-live.ts [--ticks N]
 */
import { createWalletClient, createPublicClient, http, erc20Abi, parseEther } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { config, fromBaseUnits } from "../src/unlink/config.js";
import { readObservablePayments } from "../src/spy/chain-reader.js";
import { reconstruct } from "../src/spy/reconstruct.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const TICKS = Number(arg("ticks", "3"));
const PRICE = 10n ** BigInt(Math.max(config.tokenDecimals - 3, 0)); // 0.001 USDC
const token = config.testToken as `0x${string}`;

async function main() {
  const chain = config.chain.viemChain;
  const pub = createPublicClient({ chain, transport: http(config.rpcUrl) });

  // Funder = the project wallet (index 0). Transparent agent = a fresh EOA (index 6).
  const funder = mnemonicToAccount(config.mnemonic);
  const agent = mnemonicToAccount(config.mnemonic, { accountIndex: 6 });
  const ethOracle = mnemonicToAccount(config.mnemonic, { accountIndex: 4 }).address;
  const btcOracle = mnemonicToAccount(config.mnemonic, { accountIndex: 5 }).address;
  const labels = { [ethOracle.toLowerCase()]: "ETH price", [btcOracle.toLowerCase()]: "BTC signal" };

  const funderWallet = createWalletClient({ account: funder, chain, transport: http(config.rpcUrl) });
  const agentWallet = createWalletClient({ account: agent, chain, transport: http(config.rpcUrl) });

  console.log("=== Shade :: transparent on-chain activity (Arc) ===");
  console.log(`funder (owner): ${funder.address}`);
  console.log(`transparent agent: ${agent.address}`);

  // 1. Fund the agent: native USDC for gas + an ERC-20 transfer (the visible funder edge).
  console.log("\n[fund] gas + USDC to the transparent agent…");
  const gasHash = await funderWallet.sendTransaction({ to: agent.address, value: parseEther("0.02") });
  await pub.waitForTransactionReceipt({ hash: gasHash });
  const fundAmount = PRICE * BigInt(TICKS) * 2n + PRICE; // enough for the run
  const fundHash = await funderWallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [agent.address, fundAmount] });
  await pub.waitForTransactionReceipt({ hash: fundHash });
  console.log(`  funded ${fromBaseUnits(fundAmount.toString())} USDC (visible funder→agent edge)`);

  // 2. Transparent agent pays the oracles with direct, visible transfers.
  console.log(`\n[run] ${TICKS} ticks of direct (visible) oracle payments…`);
  for (let t = 0; t < TICKS; t++) {
    const h1 = await agentWallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [ethOracle, PRICE] });
    await pub.waitForTransactionReceipt({ hash: h1 });
    const h2 = await agentWallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [btcOracle, PRICE] });
    await pub.waitForTransactionReceipt({ hash: h2 });
    console.log(`  t${t}: paid ETH + BTC oracles (visible on-chain)`);
  }

  // 3. Spy: read the chain and reconstruct — from REAL data.
  console.log("\n[spy] reading Arc and reconstructing the transparent agent…");
  const payments = await readObservablePayments({ address: agent.address, token, rpcUrl: config.rpcUrl });
  const report = reconstruct({ agentAddress: agent.address, payments, knownOracles: labels });

  console.log("\n=== 🕵️  WHAT A COMPETITOR RECONSTRUCTS (from the real chain) ===");
  console.log(`  payer:    ${report.payer}`);
  console.log(`  funder:   ${report.funder}`);
  console.log(`  oracles:  ${report.oracles.map((o) => `${o.label ?? o.oracle} (${o.calls}×)`).join(", ")}`);
  console.log(`  budget:   ${fromBaseUnits(report.totalSpent)} USDC spent`);
  console.log(`  strategy: "${report.inferredStrategy}"`);
  console.log("\n(The same activity over Unlink would reconstruct NOTHING.)");
}

main().catch((e) => { console.error("\n=== ❌ spy-live FAILED ==="); console.error(e); process.exit(1); });
