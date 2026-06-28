import { describe, it, expect, vi } from "vitest";
import { decodeFunctionData, type PublicClient } from "viem";
import { vault4626Adapter, type Vault4626Cfg } from "../../src/defi/primitives/vault4626.js";
import { erc4626Abi, erc20Abi, PERMIT2_ADDRESS } from "../../src/defi/abis.js";

const cfg: Vault4626Cfg = {
  vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  asset: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  requiresUngatedVault: true,
};
const ctx = {
  execAccount: "0xcccccccccccccccccccccccccccccccccccccccc" as const,
  token: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const,
  amount: 1_000_000n,
  slippageBps: 50,
  minOut: 980_000n,
};

describe("vault4626Adapter.buildCalls", () => {
  const calls = vault4626Adapter.buildCalls(cfg, ctx);
  it("emits approve(vault) -> deposit(receiver=EA) -> approve(Permit2)", () => {
    expect(calls).toHaveLength(3);
    const dep = decodeFunctionData({ abi: erc4626Abi, data: calls[1].data });
    expect(dep.functionName).toBe("deposit");
    expect(dep.args[0]).toBe(ctx.amount);
    expect((dep.args[1] as string).toLowerCase()).toBe(ctx.execAccount.toLowerCase());
    const permit = decodeFunctionData({ abi: erc20Abi, data: calls[2].data });
    expect((permit.args[0] as string).toLowerCase()).toBe(PERMIT2_ADDRESS.toLowerCase());
  });
});

describe("vault4626Adapter.resultToken", () => {
  it("is the vault address (share token)", () => {
    expect(vault4626Adapter.resultToken(cfg, ctx).toLowerCase()).toBe(cfg.vault.toLowerCase());
  });
});

describe("vault4626Adapter.previewMin", () => {
  it("probes maxDeposit then previewDeposit and applies slippage", async () => {
    const stub = {
      readContract: vi
        .fn()
        .mockResolvedValueOnce(10_000_000n) // maxDeposit(EA) >= amount
        .mockResolvedValueOnce(1_000_000n), // previewDeposit(amount)
    } as unknown as PublicClient;
    const min = await vault4626Adapter.previewMin(cfg, ctx, stub);
    expect(min).toBe(995_000n);
  });

  it("throws when the vault is gated (maxDeposit < amount)", async () => {
    const stub = {
      readContract: vi.fn().mockResolvedValueOnce(0n),
    } as unknown as PublicClient;
    await expect(vault4626Adapter.previewMin(cfg, ctx, stub)).rejects.toThrow(/gated|maxDeposit/i);
  });
});
