/**
 * Compile + deploy contracts/MockERC4626.sol against the configured test token,
 * then seed a dead-deposit (inflation protection). Prints the vault address to
 * paste into the E2E.
 *
 * Prerequisite: a Solidity compiler is needed — `npm i -D solc` (0.8.x). OZ
 * contracts are resolved from node_modules.
 *
 * Run: npx tsx scripts/deploy-mock-vault.ts
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, createPublicClient, http, getContract, parseUnits } from "viem";
import { privateKeyToAccount, mnemonicToAccount } from "viem/accounts";
import { config } from "../src/unlink/config.js";
import { erc20Abi } from "../src/defi/abis.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEAD = "0x000000000000000000000000000000000000dEaD" as const;

function compileVault(): { abi: any[]; bytecode: `0x${string}` } {
  let solc: any;
  try {
    solc = require("solc");
  } catch {
    throw new Error("solc not installed. Run: npm i -D solc");
  }
  const source = readFileSync(resolvePath(__dirname, "../contracts/MockERC4626.sol"), "utf8");
  const input = {
    language: "Solidity",
    sources: { "MockERC4626.sol": { content: source } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  };
  // Resolve @openzeppelin imports from node_modules.
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
  const c = out.contracts["MockERC4626.sol"]["MockERC4626"];
  return { abi: c.abi, bytecode: ("0x" + c.evm.bytecode.object) as `0x${string}` };
}

async function main() {
  const { abi, bytecode } = compileVault();
  const account = config.privateKey
    ? privateKeyToAccount(config.privateKey as `0x${string}`)
    : mnemonicToAccount(config.mnemonic);
  const chain = config.chain.viemChain;
  const wallet = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
  const pub = createPublicClient({ chain, transport: http(config.rpcUrl) });

  console.log(`[deploy] deployer=${account.address} asset=${config.testToken}`);
  const hash = await wallet.deployContract({ abi, bytecode, args: [config.testToken as `0x${string}`] });
  console.log(`[deploy] tx=${hash} — waiting...`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const vault = receipt.contractAddress!;
  console.log(`[deploy] MockERC4626 deployed at ${vault}`);

  // Seed a dead-deposit so the vault has non-zero supply (inflation protection).
  const seed = parseUnits("0.01", config.tokenDecimals);
  const token = getContract({ address: config.testToken as `0x${string}`, abi: erc20Abi, client: wallet });
  console.log(`[deploy] approving + dead-depositing ${seed} base units...`);
  const ap = await token.write.approve([vault, seed]);
  await pub.waitForTransactionReceipt({ hash: ap });
  const vaultC = getContract({ address: vault, abi, client: wallet });
  const dep = await (vaultC as any).write.deposit([seed, DEAD]);
  await pub.waitForTransactionReceipt({ hash: dep });
  console.log(`[deploy] dead-deposit done.`);
  console.log(`\nSet VAULT_ADDRESS=${vault} for scripts/defi-e2e.ts`);
}

main().catch((e) => {
  console.error("[deploy] ERROR:", e?.message ?? e);
  process.exit(1);
});
