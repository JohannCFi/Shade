import { describe, it, expect, vi } from "vitest";
import { decodeFunctionData, type PublicClient } from "viem";
import { swapAdapter, type SwapCfg } from "../../src/defi/primitives/swap.js";
import { swapRouterAbi, erc20Abi, PERMIT2_ADDRESS } from "../../src/defi/abis.js";

const cfg: SwapCfg = {
  router: "0x1111111111111111111111111111111111111111",
  quoter: "0x2222222222222222222222222222222222222222",
  tokenOut: "0x3333333333333333333333333333333333333333",
  fee: 3000,
};
const ctx = {
  execAccount: "0x4444444444444444444444444444444444444444" as const,
  token: "0x5555555555555555555555555555555555555555" as const,
  amount: 1_000_000n,
  slippageBps: 50,
  minOut: 990_000n,
};

describe("swapAdapter.buildCalls", () => {
  const calls = swapAdapter.buildCalls(cfg, ctx);

  it("emits approve(router) -> swap -> approve(Permit2) in order", () => {
    expect(calls).toHaveLength(3);
    expect(calls[0].target.toLowerCase()).toBe(ctx.token.toLowerCase());
    expect(calls[1].target.toLowerCase()).toBe(cfg.router.toLowerCase());
    expect(calls[2].target.toLowerCase()).toBe(cfg.tokenOut.toLowerCase());
    expect(calls.every((c) => c.value === "0")).toBe(true);
  });

  it("approves the router to spend amountIn on tokenIn", () => {
    const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: calls[0].data });
    expect(functionName).toBe("approve");
    expect((args[0] as string).toLowerCase()).toBe(cfg.router.toLowerCase());
    expect(args[1]).toBe(ctx.amount);
  });

  it("routes swap output to the ExecutionAccount with amountOutMinimum = minOut", () => {
    const { functionName, args } = decodeFunctionData({ abi: swapRouterAbi, data: calls[1].data });
    expect(functionName).toBe("exactInputSingle");
    const p = args[0] as any;
    expect(p.recipient.toLowerCase()).toBe(ctx.execAccount.toLowerCase());
    expect(p.amountOutMinimum).toBe(ctx.minOut);
    expect(p.amountIn).toBe(ctx.amount);
    expect(p.tokenIn.toLowerCase()).toBe(ctx.token.toLowerCase());
    expect(p.tokenOut.toLowerCase()).toBe(cfg.tokenOut.toLowerCase());
    expect(p.fee).toBe(cfg.fee);
  });

  it("approves Permit2 on the result token", () => {
    const { args } = decodeFunctionData({ abi: erc20Abi, data: calls[2].data });
    expect((args[0] as string).toLowerCase()).toBe(PERMIT2_ADDRESS.toLowerCase());
  });
});

describe("swapAdapter.previewMin", () => {
  it("quotes via QuoterV2 and applies slippage", async () => {
    const stub = {
      simulateContract: vi.fn().mockResolvedValue({ result: [1_000_000n, 0n, 0n, 0n] }),
    } as unknown as PublicClient;
    const min = await swapAdapter.previewMin(cfg, ctx, stub);
    expect(min).toBe(995_000n);
  });
});

describe("swapAdapter.resultToken", () => {
  it("is the configured tokenOut", () => {
    expect(swapAdapter.resultToken(cfg, ctx).toLowerCase()).toBe(cfg.tokenOut.toLowerCase());
  });
});
