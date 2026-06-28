import { encodeFunctionData, maxUint256, type PublicClient } from "viem";
import type { BuildContext, EvmCall, PrimitiveAdapter } from "../types.js";
import { applySlippage } from "../preview.js";
import { erc20Abi, aavePoolAbi, PERMIT2_ADDRESS } from "../abis.js";

export interface AaveSupplyCfg {
  pool: `0x${string}`;
  asset: `0x${string}`;
  /** aToken address — resolve once via pool.getReserveData(asset).aTokenAddress at registry setup. */
  aToken: `0x${string}`;
}

export const aaveSupplyAdapter: PrimitiveAdapter<AaveSupplyCfg> = {
  kind: "aaveSupply",

  // aToken mints ~1:1 with the supplied asset; apply a small slippage floor (do not hard-zero).
  async previewMin(_cfg, ctx, _publicClient: PublicClient): Promise<bigint> {
    return applySlippage(ctx.amount, ctx.slippageBps);
  },

  buildCalls(cfg, ctx: BuildContext): EvmCall[] {
    return [
      {
        target: cfg.asset,
        value: "0",
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [cfg.pool, ctx.amount],
        }),
        label: "approve pool (asset)",
      },
      {
        target: cfg.pool,
        value: "0",
        data: encodeFunctionData({
          abi: aavePoolAbi,
          functionName: "supply",
          args: [cfg.asset, ctx.amount, ctx.execAccount, 0],
        }),
        label: "aave v3 supply",
      },
      {
        target: cfg.aToken,
        value: "0",
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [PERMIT2_ADDRESS, maxUint256],
        }),
        label: "approve Permit2 (aToken)",
      },
    ];
  },

  resultToken(cfg): `0x${string}` {
    return cfg.aToken;
  },
};
