import { createWalletClient, createPublicClient, http, erc20Abi, parseEther } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { resolveChain } from "../chain/chains.js";
import { deriveSpyAddresses } from "./agents.js";

/**
 * Run the TRANSPARENT agent for real: fund a fresh agent (visible funder→agent
 * edge) and pay the oracles with direct USDC transfers (visible Transfer logs).
 * Shared by scripts/spy-live.ts and the /api/spy/run-transparent route.
 */
export async function runTransparentAgent(opts: {
  mnemonic: string;
  token: string;
  tokenDecimals?: number;
  environment?: string;
  rpcUrl?: string;
  ticks?: number;
}): Promise<{ agent: `0x${string}`; ticks: number }> {
  const chain = resolveChain(opts.environment ?? "arc-testnet");
  const rpcUrl = opts.rpcUrl ?? chain.defaultRpc;
  const decimals = opts.tokenDecimals ?? 6;
  const ticks = opts.ticks ?? 3;
  const token = opts.token as `0x${string}`;
  const price = 10n ** BigInt(Math.max(decimals - 3, 0)); // 0.001

  const addrs = deriveSpyAddresses(opts.mnemonic);
  const funder = mnemonicToAccount(opts.mnemonic);
  const agent = mnemonicToAccount(opts.mnemonic, { accountIndex: 6 });

  const pub = createPublicClient({ chain: chain.viemChain, transport: http(rpcUrl) });
  const funderWallet = createWalletClient({ account: funder, chain: chain.viemChain, transport: http(rpcUrl) });
  const agentWallet = createWalletClient({ account: agent, chain: chain.viemChain, transport: http(rpcUrl) });

  // Fund: native (gas) + ERC-20 (visible funder→agent edge).
  const gasHash = await funderWallet.sendTransaction({ to: agent.address, value: parseEther("0.02") });
  await pub.waitForTransactionReceipt({ hash: gasHash });
  const fundAmount = price * BigInt(ticks) * 2n + price;
  const fundHash = await funderWallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [agent.address, fundAmount] });
  await pub.waitForTransactionReceipt({ hash: fundHash });

  // Pay oracles with direct, visible transfers.
  for (let t = 0; t < ticks; t++) {
    const h1 = await agentWallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [addrs.ethOracle, price] });
    await pub.waitForTransactionReceipt({ hash: h1 });
    const h2 = await agentWallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [addrs.btcOracle, price] });
    await pub.waitForTransactionReceipt({ hash: h2 });
  }

  return { agent: agent.address, ticks };
}
