import { describe, it, expect } from "vitest";
import { decodeFunctionData, type PublicClient } from "viem";
import { aaveSupplyAdapter, type AaveSupplyCfg } from "../../src/defi/primitives/aaveSupply.js";
import { aavePoolAbi, erc20Abi, PERMIT2_ADDRESS } from "../../src/defi/abis.js";

const cfg: AaveSupplyCfg = {
  pool: "0xdddddddddddddddddddddddddddddddddddddddd",
  asset: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  aToken: "0xffffffffffffffffffffffffffffffffffffffff",
};
const ctx = {
  execAccount: "0x1010101010101010101010101010101010101010" as const,
  token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const,
  amount: 1_000_000n,
  slippageBps: 50,
  minOut: 995_000n, // = applySlippage(amount, 50); aave supply has no amountOutMinimum
};

describe("aaveSupplyAdapter.buildCalls", () => {
  const calls = aaveSupplyAdapter.buildCalls(cfg, ctx);
  it("emits approve(pool) -> supply(onBehalfOf=EA, ref=0) -> approve(Permit2, aToken)", () => {
    expect(calls).toHaveLength(3);
    const sup = decodeFunctionData({ abi: aavePoolAbi, data: calls[1].data });
    expect(sup.functionName).toBe("supply");
    expect((sup.args[0] as string).toLowerCase()).toBe(cfg.asset.toLowerCase());
    expect(sup.args[1]).toBe(ctx.amount);
    expect((sup.args[2] as string).toLowerCase()).toBe(ctx.execAccount.toLowerCase());
    expect(sup.args[3]).toBe(0);
    expect(calls[2].target.toLowerCase()).toBe(cfg.aToken.toLowerCase());
    const permit = decodeFunctionData({ abi: erc20Abi, data: calls[2].data });
    expect((permit.args[0] as string).toLowerCase()).toBe(PERMIT2_ADDRESS.toLowerCase());
  });
});

describe("aaveSupplyAdapter.resultToken", () => {
  it("is the aToken", () => {
    expect(aaveSupplyAdapter.resultToken(cfg, ctx).toLowerCase()).toBe(cfg.aToken.toLowerCase());
  });
});

describe("aaveSupplyAdapter.previewMin", () => {
  it("treats supply as ~1:1 minus slippage (not hard-zero)", async () => {
    const min = await aaveSupplyAdapter.previewMin(cfg, ctx, {} as unknown as PublicClient);
    expect(min).toBe(995_000n);
  });
});
