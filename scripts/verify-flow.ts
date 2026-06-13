/**
 * Headless verification of the /flow browser path WITHOUT a browser.
 *
 * Replicates exactly what the page does, but a local viem wallet stands in for
 * the Dynamic wallet: sign the derive-seed message → fromEthereumSignature,
 * register + authorization tokens via the HTTP backend routes, depositWithApproval,
 * transfer to an oracle. Proves everything except the literal Dynamic wallet UI.
 *
 * Run (server up): npx tsx scripts/verify-flow.ts
 */
import { account as unlinkAccount, createUnlinkClient, evm } from "@unlink-xyz/sdk/browser";
import { buildDeriveSeedMessage } from "@unlink-xyz/sdk/crypto";
import { createWalletClient, createPublicClient, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { config, fromBaseUnits } from "../src/unlink/config.js";
import { UNLINK_APP_ID } from "../src/unlink/browser-client.js";

const BASE = process.env.BASE_URL ?? "http://localhost:3210";
const PRICE = (10n ** BigInt(Math.max(config.tokenDecimals - 3, 0))).toString();

async function main() {
  console.log("=== Shade :: headless /flow verification (Arc) ===");
  const signer = mnemonicToAccount(config.mnemonic);
  const walletClient = createWalletClient({ account: signer, chain: config.chain.viemChain, transport: http(config.rpcUrl) });
  const publicClient = createPublicClient({ chain: config.chain.viemChain, transport: http(config.rpcUrl) });

  // 1. Derive the Unlink identity from a wallet signature (as the browser does)
  const message = buildDeriveSeedMessage({ appId: UNLINK_APP_ID, chainId: config.chain.chainId });
  const signature = await signer.signMessage({ message });
  const account = unlinkAccount.fromEthereumSignature({ signature, appId: UNLINK_APP_ID, chainId: config.chain.chainId });

  // 2. Browser-style client: register + auth via the HTTP backend routes
  const client = createUnlinkClient({
    environment: config.environment,
    account,
    evm: evm.fromViem({ walletClient: walletClient as never, publicClient: publicClient as never }),
    registerUrl: `${BASE}/api/unlink/register`,
    authorizationToken: { url: `${BASE}/api/unlink/authorization-token` },
  });

  console.log("[deploy] ensureRegistered via HTTP route…");
  await client.ensureRegistered();
  const addr = await client.getAddress();
  console.log(`  ok — unlink addr ${addr.slice(0, 20)}…`);

  console.log("[fund] depositWithApproval(0.01)…");
  await (await client.depositWithApproval({ token: config.testToken, amount: (10n ** BigInt(config.tokenDecimals - 2)).toString() })).wait();
  const { balances } = await client.getBalances({ token: config.testToken });
  const b = balances.find((x) => x.token.toLowerCase() === config.testToken.toLowerCase());
  console.log(`  ok — budget ${b ? fromBaseUnits(b.amount) : "0"} USDC`);

  console.log("[run] pay an oracle privately…");
  const sellers = await (await fetch(`${BASE}/api/oracle/sellers`)).json();
  await (await client.transfer({ token: config.testToken, amount: PRICE, recipientAddress: sellers.eth })).wait();
  console.log(`  ok — paid ${fromBaseUnits(PRICE)} USDC to ETH oracle (private)`);

  console.log("\n=== ✅ /flow path verified headless (only the Dynamic wallet click remains) ===");
}

main().catch((e) => { console.error("\n=== ❌ verify-flow FAILED ==="); console.error(e); process.exit(1); });
