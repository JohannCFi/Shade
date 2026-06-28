import type { PublicClient } from "viem";

export type PrimitiveKind = "swap" | "vault4626" | "aaveSupply";

export interface EvmCall {
  target: `0x${string}`;
  value: "0"; // always "0"; native ETH must go through WETH
  data: `0x${string}`; // encodeFunctionData(...)
  label: string; // for Unlink logs/tracing
}

/** Context before previewMin (no minOut yet). */
export interface PreviewContext {
  execAccount: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  slippageBps: number;
}

/** Full context for buildCalls — minOut resolved by previewMin. */
export interface BuildContext extends PreviewContext {
  minOut: bigint;
}

export interface PrimitiveAdapter<Cfg> {
  kind: PrimitiveKind;
  /** Conservative result amount (on-chain preview + slippage). Called FIRST. */
  previewMin(cfg: Cfg, ctx: PreviewContext, publicClient: PublicClient): Promise<bigint>;
  /** Ordered batch for execute(): approves + action(recipient=EA) + approve(Permit2, resultToken). */
  buildCalls(cfg: Cfg, ctx: BuildContext): EvmCall[];
  /** Redepositable result token address. */
  resultToken(cfg: Cfg, ctx: BuildContext): `0x${string}`;
}
