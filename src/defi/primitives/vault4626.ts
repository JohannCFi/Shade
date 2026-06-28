import { encodeFunctionData, maxUint256, type PublicClient } from "viem";
import type { BuildContext, EvmCall, PrimitiveAdapter } from "../types.js";
import { applySlippage } from "../preview.js";
import { erc20Abi, erc4626Abi, PERMIT2_ADDRESS } from "../abis.js";

export interface Vault4626Cfg {
  vault: `0x${string}`;
  asset: `0x${string}`;
  requiresUngatedVault: boolean;
}

export const vault4626Adapter: PrimitiveAdapter<Vault4626Cfg> = {
  kind: "vault4626",

  async previewMin(cfg, ctx, publicClient: PublicClient): Promise<bigint> {
    if (cfg.requiresUngatedVault) {
      // Pre-flight: a gated/capped vault rejects the ephemeral EA. Probe maxDeposit
      // so we fail clearly BEFORE withdrawing funds, not with an opaque on-chain revert.
      const maxDep = await publicClient.readContract({
        address: cfg.vault,
        abi: erc4626Abi,
        functionName: "maxDeposit",
        args: [ctx.execAccount],
      });
      if (maxDep < ctx.amount) {
        throw new Error(
          `vault ${cfg.vault} is gated or capped for ${ctx.execAccount}: maxDeposit=${maxDep} < amount=${ctx.amount}`,
        );
      }
    }
    const shares = await publicClient.readContract({
      address: cfg.vault,
      abi: erc4626Abi,
      functionName: "previewDeposit",
      args: [ctx.amount],
    });
    return applySlippage(shares, ctx.slippageBps);
  },

  buildCalls(cfg, ctx: BuildContext): EvmCall[] {
    return [
      {
        target: cfg.asset,
        value: "0",
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [cfg.vault, ctx.amount],
        }),
        label: "approve vault (asset)",
      },
      {
        target: cfg.vault,
        value: "0",
        data: encodeFunctionData({
          abi: erc4626Abi,
          functionName: "deposit",
          args: [ctx.amount, ctx.execAccount],
        }),
        label: "erc4626 deposit",
      },
      {
        target: cfg.vault,
        value: "0",
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [PERMIT2_ADDRESS, maxUint256],
        }),
        label: "approve Permit2 (shares)",
      },
    ];
  },

  resultToken(cfg): `0x${string}` {
    return cfg.vault;
  },
};
