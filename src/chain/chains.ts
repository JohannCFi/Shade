import { arcTestnet, baseSepolia, sepolia } from "viem/chains";
import type { Chain } from "viem";

/**
 * Single source of truth for the chains Shade can run on. The active chain is
 * chosen by UNLINK_ENVIRONMENT so we can flip the whole stack (Unlink + Circle +
 * agent + oracles) between Arc Testnet and Base Sepolia with one env var.
 *
 * Arc Testnet is the active target (Circle Nanopayments is native there + the
 * hackathon's Arc track); Base Sepolia is kept as a fully-supported fallback.
 */
export type EnvName = "arc-testnet" | "base-sepolia" | "ethereum-sepolia";

/** Circle GatewayClient's chain identifier (@circle-fin/x402-batching). */
export type CircleChainName = "arcTestnet" | "baseSepolia" | "sepolia";

export interface ChainInfo {
  env: EnvName;
  viemChain: Chain;
  chainId: number;
  /** CAIP-2 id used in x402 payment requirements, e.g. "eip155:5042002". */
  caip2: string;
  circleChainName: CircleChainName;
  defaultRpc: string;
  /** True when the native gas token is USDC (Arc), not ETH. */
  gasIsUsdc: boolean;
}

export const CHAINS: Record<EnvName, ChainInfo> = {
  "arc-testnet": {
    env: "arc-testnet",
    viemChain: arcTestnet,
    chainId: 5042002,
    caip2: "eip155:5042002",
    circleChainName: "arcTestnet",
    defaultRpc: arcTestnet.rpcUrls.default.http[0],
    gasIsUsdc: true,
  },
  "base-sepolia": {
    env: "base-sepolia",
    viemChain: baseSepolia,
    chainId: 84532,
    caip2: "eip155:84532",
    circleChainName: "baseSepolia",
    defaultRpc: "https://sepolia.base.org",
    gasIsUsdc: false,
  },
  "ethereum-sepolia": {
    env: "ethereum-sepolia",
    viemChain: sepolia,
    chainId: 11155111,
    caip2: "eip155:11155111",
    circleChainName: "sepolia",
    defaultRpc: sepolia.rpcUrls.default.http[0],
    gasIsUsdc: false,
  },
};

export function resolveChain(env: string | undefined): ChainInfo {
  const key = (env ?? "arc-testnet") as EnvName;
  const info = CHAINS[key];
  if (!info) {
    throw new Error(
      `Unsupported UNLINK_ENVIRONMENT "${env}". Use one of: ${Object.keys(CHAINS).join(", ")}`,
    );
  }
  return info;
}
