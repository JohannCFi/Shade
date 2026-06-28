import { encodeFunctionData, type Hash } from "viem";
import { erc20Abi, swapRouterAbi, erc4626Abi, aavePoolAbi } from "../defi/abis.js";
import type { RegistryEntry } from "../defi/registry.js";

/**
 * Execute one DeFi allocation DIRECTLY from the agent's own EOA — the TRANSPARENT
 * rail. Recipient = the agent itself; no privacy. The resulting on-chain ERC-20
 * Transfer (agent → venue) is exactly what the spy reconstructs as the leaked
 * capital allocation. Approve + action, both real, returns the action tx hash.
 *
 * Minimal viem surface so this stays usable behind the transparent-run IO seam
 * (no chain client type imported — `wallet`/`pub` are duck-typed).
 */
export interface TradeClients {
  agent: `0x${string}`;
  token: `0x${string}`; // the input token (USDC) the agent spends
  writeContract(args: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }): Promise<Hash>;
  sendTransaction(args: { to: `0x${string}`; data: `0x${string}` }): Promise<Hash>;
  waitForTransactionReceipt(args: { hash: Hash }): Promise<unknown>;
}

/** Build the venue action calldata (recipient = agent) for the transparent rail. */
function actionCall(entry: RegistryEntry, agent: `0x${string}`, token: `0x${string}`, amount: bigint): {
  spender: `0x${string}`;
  target: `0x${string}`;
  data: `0x${string}`;
} {
  switch (entry.kind) {
    case "swap":
      return {
        spender: entry.cfg.router,
        target: entry.cfg.router,
        data: encodeFunctionData({
          abi: swapRouterAbi,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: token,
              tokenOut: entry.cfg.tokenOut,
              fee: entry.cfg.fee,
              recipient: agent,
              amountIn: amount,
              amountOutMinimum: 0n, // demo (transparent rail); the private rail uses a real minOut
              sqrtPriceLimitX96: 0n,
            },
          ],
        }),
      };
    case "vault4626":
      return {
        spender: entry.cfg.vault,
        target: entry.cfg.vault,
        data: encodeFunctionData({ abi: erc4626Abi, functionName: "deposit", args: [amount, agent] }),
      };
    case "aaveSupply":
      return {
        spender: entry.cfg.pool,
        target: entry.cfg.pool,
        data: encodeFunctionData({ abi: aavePoolAbi, functionName: "supply", args: [entry.cfg.asset, amount, agent, 0] }),
      };
  }
}

/** Approve the venue then run the action from the agent EOA; returns the action tx hash. */
export async function tradeTransparent(
  clients: TradeClients,
  entry: RegistryEntry,
  amount: bigint,
): Promise<Hash> {
  const { spender, target, data } = actionCall(entry, clients.agent, clients.token, amount);
  const ap = await clients.writeContract({
    address: clients.token,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  });
  await clients.waitForTransactionReceipt({ hash: ap });
  const hash = await clients.sendTransaction({ to: target, data });
  await clients.waitForTransactionReceipt({ hash });
  return hash;
}
