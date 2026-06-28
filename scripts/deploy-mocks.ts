/**
 * Compile + deploy the demo DeFi mock venues (swap router/quoter/tokenOut, aave
 * pool/aToken) on the active testnet, fund the swap router with tokenOut so it can
 * pay swaps, and print the addresses to add to .env for the /spy demo.
 *
 * Prerequisite: `npm i -D solc` (already a devDep).
 * Run: npx tsx scripts/deploy-mocks.ts
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount, mnemonicToAccount } from "viem/accounts";
import { config } from "../src/unlink/config.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

interface Compiled {
  abi: any[];
  bytecode: `0x${string}`;
}

function compile(file: string): Record<string, Compiled> {
  let solc: any;
  try {
    solc = require("solc");
  } catch {
    throw new Error("solc not installed. Run: npm i -D solc");
  }
  const source = readFileSync(resolvePath(__dirname, `../contracts/${file}`), "utf8");
  const input = {
    language: "Solidity",
    sources: { [file]: { content: source } },
    settings: { viaIR: true, optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  };
  function findImports(path: string) {
    try {
      return { contents: readFileSync(require.resolve(path), "utf8") };
    } catch (e: any) {
      return { error: `not found: ${path} (${e?.message})` };
    }
  }
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errors = (out.errors ?? []).filter((e: any) => e.severity === "error");
  if (errors.length) throw new Error("solc errors:\n" + errors.map((e: any) => e.formattedMessage).join("\n"));
  const result: Record<string, Compiled> = {};
  for (const [name, c] of Object.entries<any>(out.contracts[file])) {
    result[name] = { abi: c.abi, bytecode: ("0x" + c.evm.bytecode.object) as `0x${string}` };
  }
  return result;
}

async function main() {
  const c = compile("DemoMocks.sol");
  const account = config.privateKey
    ? privateKeyToAccount(config.privateKey as `0x${string}`)
    : mnemonicToAccount(config.mnemonic);
  const chain = config.chain.viemChain;
  const wallet = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
  const pub = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const dec = config.tokenDecimals;
  const usdc = config.testToken as `0x${string}`;

  async function deploy(name: string, args: any[]): Promise<`0x${string}`> {
    const { abi, bytecode } = c[name];
    const hash = await wallet.deployContract({ abi, bytecode, args });
    const r = await pub.waitForTransactionReceipt({ hash });
    console.log(`[deploy] ${name} -> ${r.contractAddress}`);
    return r.contractAddress!;
  }

  console.log(`[deploy] deployer=${account.address} asset(USDC)=${usdc} decimals=${dec}`);

  // Swap venue: a tokenOut ("mWETH"), a router, a quoter. Fund the router so it can pay swaps.
  const tokenOut = await deploy("MockERC20", ["Mock WETH", "mWETH", dec]);
  const router = await deploy("MockSwapRouter", []);
  const quoter = await deploy("MockQuoterV2", []);
  const mintAbi = c["MockERC20"].abi;
  const liquidity = 1_000n * 10n ** BigInt(dec);
  const mintHash = await wallet.writeContract({ address: tokenOut, abi: mintAbi, functionName: "mint", args: [router, liquidity] });
  await pub.waitForTransactionReceipt({ hash: mintHash });
  console.log(`[deploy] funded router with ${liquidity} mWETH`);

  // Aave venue: a pool that mints an aToken on supply.
  const pool = await deploy("MockAavePool", [usdc, dec]);
  const aToken = (await pub.readContract({ address: pool, abi: c["MockAavePool"].abi, functionName: "aToken" })) as `0x${string}`;
  console.log(`[deploy] aave aToken -> ${aToken}`);

  console.log("\n=== add to .env (and .env.example keys) ===");
  console.log(`DEFI_SWAP_ROUTER=${router}`);
  console.log(`DEFI_SWAP_QUOTER=${quoter}`);
  console.log(`DEFI_SWAP_TOKENOUT=${tokenOut}`);
  console.log(`DEFI_SWAP_FEE=3000`);
  console.log(`DEFI_AAVE_POOL=${pool}`);
  console.log(`DEFI_AAVE_ATOKEN=${aToken}`);
  console.log(`# DEFI_VAULT_ADDRESS already deployed: 0x4e22a0c79b16a48512d80fdb19f98ab9f42f30a9`);
}

main().catch((e) => {
  console.error("[deploy] ERROR:", e?.message ?? e);
  process.exit(1);
});
