import { describe, it, expect, vi } from "vitest";
import { runPrivateDefi } from "../../src/defi/run.js";

function mockClient(executeImpl?: () => Promise<any>) {
  return {
    executionAccounts: {
      reserve: vi.fn().mockResolvedValue({
        account_address: "0x9999999999999999999999999999999999999999",
        account_index: 7,
      }),
    },
    execute: vi.fn(executeImpl ?? (async () => ({ status: "completed", executionId: "exec-1" }))),
  };
}

const token = "0x5555555555555555555555555555555555555555" as const;

describe("runPrivateDefi", () => {
  it("reserves fresh, previews, builds, executes by_index with depositBack.amount === minOut", async () => {
    const client = mockClient();
    const publicClient = {} as any;
    const adapter = {
      kind: "vault4626" as const,
      previewMin: vi.fn().mockResolvedValue(980_000n),
      buildCalls: vi.fn().mockReturnValue([{ target: "0x00", value: "0", data: "0x", label: "x" }]),
      resultToken: vi.fn().mockReturnValue("0xaaaa"),
    };
    const res = await runPrivateDefi(
      client as any,
      publicClient,
      "test-id",
      { token, amount: 1_000_000n, slippageBps: 50 },
      { entry: { kind: "vault4626", cfg: {} as any }, adapter },
    );

    expect(client.executionAccounts.reserve).toHaveBeenCalledWith({ policy: "fresh" });
    // previewMin before buildCalls
    expect(adapter.previewMin.mock.invocationCallOrder[0]).toBeLessThan(
      adapter.buildCalls.mock.invocationCallOrder[0],
    );
    const execArg = (client.execute.mock.calls[0] as any[])[0];
    expect(execArg.allocationPolicy).toBe("by_index");
    expect(execArg.accountIndex).toBe(7);
    expect(execArg.depositBack.amount).toBe("980000");
    expect(res.minOut).toBe(980_000n);
    expect(res.execAccount).toBe("0x9999999999999999999999999999999999999999");
  });

  it("rejects slippageBps=0 unless allowZeroSlippage", async () => {
    const client = mockClient();
    const adapter = { kind: "swap", previewMin: vi.fn(), buildCalls: vi.fn(), resultToken: vi.fn() };
    await expect(
      runPrivateDefi(
        client as any,
        {} as any,
        "id",
        { token, amount: 1n, slippageBps: 0 },
        { entry: { kind: "swap", cfg: {} as any }, adapter: adapter as any },
      ),
    ).rejects.toThrow(/slippage/i);
  });

  it("wraps execute failures in DefiExecuteError with the reserved execAccount", async () => {
    const client = mockClient(async () => {
      throw new Error("batch reverted");
    });
    const adapter = {
      kind: "swap" as const,
      previewMin: vi.fn().mockResolvedValue(1n),
      buildCalls: vi.fn().mockReturnValue([]),
      resultToken: vi.fn().mockReturnValue("0xaaaa"),
    };
    await expect(
      runPrivateDefi(
        client as any,
        {} as any,
        "id",
        { token, amount: 1n, slippageBps: 50 },
        { entry: { kind: "swap", cfg: {} as any }, adapter },
      ),
    ).rejects.toMatchObject({
      name: "DefiExecuteError",
      execAccount: "0x9999999999999999999999999999999999999999",
    });
  });

  it("derives execAccount via execAccountResolver when reserve omits account_address", async () => {
    const client = mockClient();
    client.executionAccounts.reserve = vi
      .fn()
      .mockResolvedValue({ account_index: 4, tenant_index: 48, chain_index: 1 });
    const resolver = vi.fn().mockResolvedValue("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    const adapter = {
      kind: "vault4626" as const,
      previewMin: vi.fn().mockResolvedValue(1n),
      buildCalls: vi.fn().mockReturnValue([]),
      resultToken: vi.fn().mockReturnValue("0xaaaa"),
    };
    const res = await runPrivateDefi(
      client as any,
      {} as any,
      "id",
      { token, amount: 1n, slippageBps: 50, execAccountResolver: resolver },
      { entry: { kind: "vault4626", cfg: {} as any }, adapter },
    );
    expect(resolver).toHaveBeenCalledOnce();
    expect(res.execAccount).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    // adapter saw the resolved address as recipient
    const previewCtx = adapter.previewMin.mock.calls[0]![1] as any;
    expect(previewCtx.execAccount).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("throws when reserve returns no account_address and no resolver", async () => {
    const client = mockClient();
    client.executionAccounts.reserve = vi.fn().mockResolvedValue({ account_index: 3 });
    const adapter = {
      kind: "swap" as const,
      previewMin: vi.fn(),
      buildCalls: vi.fn(),
      resultToken: vi.fn(),
    };
    await expect(
      runPrivateDefi(
        client as any,
        {} as any,
        "id",
        { token, amount: 1n, slippageBps: 50 },
        { entry: { kind: "swap", cfg: {} as any }, adapter },
      ),
    ).rejects.toThrow(/account_address/i);
  });
});
