/**
 * Mint test ULNKm tokens to the EVM wallet.
 *
 * The Unlink faucet (requestTestTokens/requestPrivateTokens) rejects this
 * project's token ("token not supported by faucet"), but the ERC20forTest token
 * exposes a PUBLIC mint(address,uint256) on base-sepolia — so we self-mint.
 * Requires the wallet to hold a little Base Sepolia ETH for gas.
 *
 * Run: npx tsx scripts/mint-tokens.ts [amountHuman]   (default 100)
 */
import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { config, fromBaseUnits, toBaseUnits } from "../src/unlink/config.js";

const ERC20_TEST_ABI = parseAbi([
  "function mint(address to, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
]);

async function main() {
  const amountHuman = process.argv[2] ?? "100";
  const account = config.privateKey
    ? privateKeyToAccount(config.privateKey as `0x${string}`)
    : mnemonicToAccount(config.mnemonic);

  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(config.rpcUrl) });
  const pub = createPublicClient({ chain: baseSepolia, transport: http(config.rpcUrl) });

  const amount = BigInt(toBaseUnits(amountHuman));
  console.log(`Minting ${amountHuman} test tokens to ${account.address}…`);
  const hash = await wallet.writeContract({
    address: config.testToken as `0x${string}`,
    abi: ERC20_TEST_ABI,
    functionName: "mint",
    args: [account.address, amount],
  });
  console.log(`tx: ${hash}`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`status: ${receipt.status}`);

  const bal = await pub.readContract({
    address: config.testToken as `0x${string}`,
    abi: ERC20_TEST_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`balance: ${fromBaseUnits(bal.toString())} tokens`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
