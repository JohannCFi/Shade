import { encodeFunctionData, maxUint256, type PublicClient } from "viem";
import type { BuildContext, EvmCall, PrimitiveAdapter } from "../types.js";
import { applySlippage } from "../preview.js";
import { erc20Abi, swapRouterAbi, quoterV2Abi, PERMIT2_ADDRESS } from "../abis.js";

export interface SwapCfg {
  router: `0x${string}`;
  quoter: `0x${string}`;
  tokenOut: `0x${string}`;
  fee: number; // 500 | 3000 | 10000
}

export const swapAdapter: PrimitiveAdapter<SwapCfg> = {
  kind: "swap",

  async previewMin(cfg, ctx, publicClient: PublicClient): Promise<bigint> {
    // QuoterV2 is state-changing — read via simulateContract, not readContract.
    const { result } = await publicClient.simulateContract({
      address: cfg.quoter,
      abi: quoterV2Abi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: ctx.token,
          tokenOut: cfg.tokenOut,
          amountIn: ctx.amount,
          fee: cfg.fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    const amountOut = (result as readonly bigint[])[0];
    return applySlippage(amountOut, ctx.slippageBps);
  },

  buildCalls(cfg, ctx: BuildContext): EvmCall[] {
    return [
      {
        target: ctx.token,
        value: "0",
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [cfg.router, ctx.amount],
        }),
        label: "approve router (tokenIn)",
      },
      {
        target: cfg.router,
        value: "0",
        data: encodeFunctionData({
          abi: swapRouterAbi,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: ctx.token,
              tokenOut: cfg.tokenOut,
              fee: cfg.fee,
              recipient: ctx.execAccount,
              amountIn: ctx.amount,
              amountOutMinimum: ctx.minOut,
              sqrtPriceLimitX96: 0n,
            },
          ],
        }),
        label: "uniswap v3 exactInputSingle",
      },
      {
        target: cfg.tokenOut,
        value: "0",
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [PERMIT2_ADDRESS, maxUint256],
        }),
        label: "approve Permit2 (result token)",
      },
    ];
  },

  resultToken(cfg): `0x${string}` {
    return cfg.tokenOut;
  },
};
