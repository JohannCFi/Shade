# Private DeFi via Unlink execute() — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `src/defi/` — a client-agnostic layer that runs private DeFi actions (swap, ERC-4626 vault deposit, Aave supply) through Unlink `execute()`: reserve a fresh ExecutionAccount, run an atomic EVM batch, and `depositBack` the resulting ERC-20 into the private pool.

**Architecture:** One generic adapter per *primitive* (not per protocol). Each adapter is a set of **pure functions** (`previewMin` → `buildCalls` → `resultToken`) that encode EVM calls with viem and read on-chain quotes — no Unlink/network coupling, so they unit-test offline. A single `runPrivateDefi` runner orchestrates reserve→preview→build→execute with a fixed-amount `depositBack`. A `registry` maps human ids → `{ kind, cfg }`, and a `kind → adapter` map resolves the implementation.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), viem (`encodeFunctionData`, `PublicClient`), `@unlink-xyz/sdk` (`client.execute`, `client.executionAccounts.reserve`), vitest.

**Spec:** `docs/superpowers/specs/2026-06-28-private-defi-execute-design.md` — read it first.

**Commands:**
- Test: `npm test` (vitest run) — single file: `npx vitest run tests/defi/swap.test.ts`
- Typecheck: `npx tsc --noEmit`
- E2E script (needs `.env`): `npx tsx scripts/defi-e2e.ts`

**Conventions to match (from existing code):**
- ESM imports use `.js` extensions even for `.ts` files (e.g. `import { x } from "./types.js"`).
- Tests live in `tests/**`, import from `../src/**/*.js`, use `describe/it/expect` from vitest.
- Addresses typed as `` `0x${string}` ``.

---

## File Structure

```
src/defi/
  types.ts            # PrimitiveKind, EvmCall, BuildContext, PrimitiveAdapter
  abis.ts             # minimal ABIs (erc20, swapRouter, quoterV2, erc4626, aavePool, permit2) + PERMIT2 address
  errors.ts           # DefiExecuteError
  preview.ts          # applySlippage(amount, bps) helper
  primitives/
    swap.ts           # Uniswap v3 adapter
    vault4626.ts      # ERC-4626 adapter (+ gate pre-flight)
    aaveSupply.ts     # Aave v3 supply adapter
  registry.ts         # registry id → { kind, cfg } + ADAPTERS: kind → adapter
  run.ts              # runPrivateDefi() runner
tests/defi/
  swap.test.ts
  vault4626.test.ts
  aaveSupply.test.ts
  preview.test.ts
  run.test.ts
contracts/
  MockERC4626.sol     # gateless OZ ERC-4626 for E2E (deployed via script)
scripts/
  deploy-mock-vault.ts
  defi-e2e.ts
```

---

## Chunk 1: Foundations (types, ABIs, errors, slippage)

### Task 1: Core types

**Files:**
- Create: `src/defi/types.ts`
- Test: `tests/defi/preview.test.ts` (covers types indirectly via preview; no standalone type test)

- [ ] **Step 1: Create `src/defi/types.ts`**

```ts
import type { PublicClient } from "viem";

export type PrimitiveKind = "swap" | "vault4626" | "aaveSupply";

export interface EvmCall {
  target: `0x${string}`;
  value: "0";          // always "0"; native ETH must go through WETH
  data: `0x${string}`; // encodeFunctionData(...)
  label: string;       // for Unlink logs/tracing
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
```

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` — Expected: PASS (no other files reference it yet).
- [ ] **Step 3: Commit** — `git add src/defi/types.ts && git commit -m "feat(defi): core adapter types"`

---

### Task 2: ABIs + Permit2 constant

**Files:**
- Create: `src/defi/abis.ts`

ABIs are minimal (only the functions we encode). Verify the Permit2 canonical address (`0x000000000022D473030F116dDEE9F6B43aC78BA3` — same across chains) and pin the deposit-back Permit2 layering against the SDK during Task 8.

- [ ] **Step 1: Create `src/defi/abis.ts`**

```ts
import { parseAbi } from "viem";

export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

// Uniswap v3 ISwapRouter.exactInputSingle
export const swapRouterAbi = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)",
]);

// Uniswap v3 QuoterV2 (state-changing signature, called via simulate/read)
export const quoterV2Abi = parseAbi([
  "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

export const erc4626Abi = parseAbi([
  "function asset() view returns (address)",
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
  "function previewDeposit(uint256 assets) view returns (uint256 shares)",
  "function maxDeposit(address receiver) view returns (uint256 maxAssets)",
]);

export const aavePoolAbi = parseAbi([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
  "function getReserveData(address asset) view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)",
]);
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 3: Commit** — `git add src/defi/abis.ts && git commit -m "feat(defi): minimal ABIs + Permit2 address"`

---

### Task 3: Errors + slippage helper

**Files:**
- Create: `src/defi/errors.ts`, `src/defi/preview.ts`
- Test: `tests/defi/preview.test.ts`

- [ ] **Step 1: Write failing test `tests/defi/preview.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { applySlippage } from "../../src/defi/preview.js";

describe("applySlippage", () => {
  it("subtracts the slippage margin in bps", () => {
    expect(applySlippage(10_000n, 50)).toBe(9_950n);   // 0.50%
  });
  it("is identity at 0 bps", () => {
    expect(applySlippage(10_000n, 0)).toBe(10_000n);
  });
  it("rounds down (floor)", () => {
    expect(applySlippage(3n, 50)).toBe(2n);            // 3*9950/10000 = 2.985 -> 2
  });
  it("throws on negative or >10000 bps", () => {
    expect(() => applySlippage(1n, -1)).toThrow();
    expect(() => applySlippage(1n, 10_001)).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/defi/preview.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/defi/preview.ts`**

```ts
const BPS_DENOM = 10_000n;

/** Reduce `amount` by `bps` basis points, flooring. Used to derive a conservative minOut. */
export function applySlippage(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error(`slippageBps out of range: ${bps}`);
  }
  return (amount * (BPS_DENOM - BigInt(bps))) / BPS_DENOM;
}
```

- [ ] **Step 4: Create `src/defi/errors.ts`**

```ts
export class DefiExecuteError extends Error {
  readonly execAccount: `0x${string}`;
  readonly registryId: string;
  readonly cause: unknown;
  constructor(cause: unknown, ctx: { execAccount: `0x${string}`; registryId: string }) {
    super(`DeFi execute failed for ${ctx.registryId} (execAccount ${ctx.execAccount}): ${String(cause)}`);
    this.name = "DefiExecuteError";
    this.cause = cause;
    this.execAccount = ctx.execAccount;
    this.registryId = ctx.registryId;
  }
}
```

- [ ] **Step 5: Run, verify PASS** — `npx vitest run tests/defi/preview.test.ts` — Expected: PASS (4 tests).
- [ ] **Step 6: Commit** — `git add src/defi/preview.ts src/defi/errors.ts tests/defi/preview.test.ts && git commit -m "feat(defi): slippage helper + DefiExecuteError"`

---

## Chunk 2: Adapters

Each adapter is tested offline: `buildCalls`/`resultToken` are pure (assert encoded calldata, order, recipient); `previewMin` takes a `PublicClient` we stub with a minimal object exposing only the methods used (`readContract` / `simulateContract`). Use a typed stub cast `as unknown as PublicClient`.

### Task 4: Swap adapter (Uniswap v3)

**Files:**
- Create: `src/defi/primitives/swap.ts`
- Test: `tests/defi/swap.test.ts`

**Config:** `{ router, quoter, tokenOut, fee }` (no slippageBps — comes from ctx).

`buildCalls` order: `[approve(router, tokenIn, amount), exactInputSingle(recipient=EA, amountOutMinimum=ctx.minOut), approve(PERMIT2, tokenOut, max)]`. `resultToken` = `cfg.tokenOut`. `previewMin` = `quoteExactInputSingle` (via `simulateContract`, since QuoterV2 is non-view) then `applySlippage`.

- [ ] **Step 1: Write failing test `tests/defi/swap.test.ts`**

```ts
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
    expect(calls[0].target.toLowerCase()).toBe(ctx.token.toLowerCase());     // approve tokenIn
    expect(calls[1].target.toLowerCase()).toBe(cfg.router.toLowerCase());    // swap
    expect(calls[2].target.toLowerCase()).toBe(cfg.tokenOut.toLowerCase());  // approve tokenOut->Permit2
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
    expect(min).toBe(995_000n); // 1_000_000 * (10000-50)/10000
  });
});

describe("swapAdapter.resultToken", () => {
  it("is the configured tokenOut", () => {
    expect(swapAdapter.resultToken(cfg, ctx).toLowerCase()).toBe(cfg.tokenOut.toLowerCase());
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/defi/swap.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/defi/primitives/swap.ts`**

```ts
import { encodeFunctionData, maxUint256, type PublicClient } from "viem";
import type { BuildContext, EvmCall, PreviewContext, PrimitiveAdapter } from "../types.js";
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
    const { result } = await publicClient.simulateContract({
      address: cfg.quoter,
      abi: quoterV2Abi,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn: ctx.token, tokenOut: cfg.tokenOut, amountIn: ctx.amount, fee: cfg.fee, sqrtPriceLimitX96: 0n }],
    });
    const amountOut = (result as readonly bigint[])[0];
    return applySlippage(amountOut, ctx.slippageBps);
  },

  buildCalls(cfg, ctx: BuildContext): EvmCall[] {
    return [
      {
        target: ctx.token,
        value: "0",
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [cfg.router, ctx.amount] }),
        label: "approve router (tokenIn)",
      },
      {
        target: cfg.router,
        value: "0",
        data: encodeFunctionData({
          abi: swapRouterAbi,
          functionName: "exactInputSingle",
          args: [{
            tokenIn: ctx.token, tokenOut: cfg.tokenOut, fee: cfg.fee,
            recipient: ctx.execAccount, amountIn: ctx.amount,
            amountOutMinimum: ctx.minOut, sqrtPriceLimitX96: 0n,
          }],
        }),
        label: "uniswap v3 exactInputSingle",
      },
      {
        target: cfg.tokenOut,
        value: "0",
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [PERMIT2_ADDRESS, maxUint256] }),
        label: "approve Permit2 (result token)",
      },
    ];
  },

  resultToken(cfg): `0x${string}` {
    return cfg.tokenOut;
  },
};
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/defi/swap.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/defi/primitives/swap.ts tests/defi/swap.test.ts && git commit -m "feat(defi): uniswap v3 swap adapter"`

---

### Task 5: ERC-4626 vault adapter (+ gate pre-flight)

**Files:**
- Create: `src/defi/primitives/vault4626.ts`
- Test: `tests/defi/vault4626.test.ts`

**Config:** `{ vault, asset, requiresUngatedVault }`.

`buildCalls`: `[approve(vault, asset, amount), deposit(amount, receiver=EA), approve(PERMIT2, vault, max)]` (vault address IS the share token for ERC-4626). `resultToken` = `cfg.vault`. `previewMin`: if `requiresUngatedVault`, first probe `maxDeposit(EA)` and throw if `< amount` (gate/cap); then `previewDeposit(amount)` and `applySlippage`.

- [ ] **Step 1: Write failing test `tests/defi/vault4626.test.ts`**

```ts
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
      readContract: vi.fn()
        .mockResolvedValueOnce(10_000_000n)  // maxDeposit(EA) >= amount
        .mockResolvedValueOnce(1_000_000n),  // previewDeposit(amount)
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
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/defi/vault4626.test.ts`.

- [ ] **Step 3: Create `src/defi/primitives/vault4626.ts`**

```ts
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
      const maxDep = await publicClient.readContract({
        address: cfg.vault, abi: erc4626Abi, functionName: "maxDeposit", args: [ctx.execAccount],
      });
      if (maxDep < ctx.amount) {
        throw new Error(`vault ${cfg.vault} is gated or capped for ${ctx.execAccount}: maxDeposit=${maxDep} < amount=${ctx.amount}`);
      }
    }
    const shares = await publicClient.readContract({
      address: cfg.vault, abi: erc4626Abi, functionName: "previewDeposit", args: [ctx.amount],
    });
    return applySlippage(shares, ctx.slippageBps);
  },

  buildCalls(cfg, ctx: BuildContext): EvmCall[] {
    return [
      {
        target: cfg.asset, value: "0",
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [cfg.vault, ctx.amount] }),
        label: "approve vault (asset)",
      },
      {
        target: cfg.vault, value: "0",
        data: encodeFunctionData({ abi: erc4626Abi, functionName: "deposit", args: [ctx.amount, ctx.execAccount] }),
        label: "erc4626 deposit",
      },
      {
        target: cfg.vault, value: "0",
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [PERMIT2_ADDRESS, maxUint256] }),
        label: "approve Permit2 (shares)",
      },
    ];
  },

  resultToken(cfg): `0x${string}` {
    return cfg.vault;
  },
};
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/defi/vault4626.test.ts`.
- [ ] **Step 5: Commit** — `git add src/defi/primitives/vault4626.ts tests/defi/vault4626.test.ts && git commit -m "feat(defi): erc4626 vault adapter with gate pre-flight"`

---

### Task 6: Aave v3 supply adapter

**Files:**
- Create: `src/defi/primitives/aaveSupply.ts`
- Test: `tests/defi/aaveSupply.test.ts`

**Config:** `{ pool, asset }`. `buildCalls`: `[approve(pool, asset, amount), supply(asset, amount, onBehalfOf=EA, 0), approve(PERMIT2, aToken, max)]`. The result token is the **aToken**, read from `pool.getReserveData(asset).aTokenAddress` — so `resultToken` is async-resolved during `previewMin` and cached on ctx via a closure is NOT possible (resultToken is sync). Resolution: `previewMin` reads the aToken and stashes it; but adapters are stateless. Instead make the aToken part of `cfg` (resolved once at registry build / E2E setup) OR read it inside `buildCalls` — but buildCalls is sync. **Decision:** aToken address is a **required cfg field** (`aToken`), resolved when the registry entry is created (one `getReserveData` call at setup, documented). This keeps `resultToken` sync and pure.

Revised **Config:** `{ pool, asset, aToken }`.

- [ ] **Step 1: Write failing test `tests/defi/aaveSupply.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
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
  minOut: 999_000n,
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
    expect(min).toBe(995_000n); // 1_000_000 * (10000-50)/10000
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/defi/aaveSupply.test.ts`.

- [ ] **Step 3: Create `src/defi/primitives/aaveSupply.ts`**

```ts
import { encodeFunctionData, maxUint256, type PublicClient } from "viem";
import type { BuildContext, EvmCall, PrimitiveAdapter } from "../types.js";
import { applySlippage } from "../preview.js";
import { erc20Abi, aavePoolAbi, PERMIT2_ADDRESS } from "../abis.js";

export interface AaveSupplyCfg {
  pool: `0x${string}`;
  asset: `0x${string}`;
  aToken: `0x${string}`; // resolved once via pool.getReserveData(asset).aTokenAddress at registry setup
}

export const aaveSupplyAdapter: PrimitiveAdapter<AaveSupplyCfg> = {
  kind: "aaveSupply",

  // aToken mints ~1:1 with the supplied asset; apply a small slippage floor (no hard-zero).
  async previewMin(_cfg, ctx, _publicClient: PublicClient): Promise<bigint> {
    return applySlippage(ctx.amount, ctx.slippageBps);
  },

  buildCalls(cfg, ctx: BuildContext): EvmCall[] {
    return [
      {
        target: cfg.asset, value: "0",
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [cfg.pool, ctx.amount] }),
        label: "approve pool (asset)",
      },
      {
        target: cfg.pool, value: "0",
        data: encodeFunctionData({ abi: aavePoolAbi, functionName: "supply", args: [cfg.asset, ctx.amount, ctx.execAccount, 0] }),
        label: "aave v3 supply",
      },
      {
        target: cfg.aToken, value: "0",
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [PERMIT2_ADDRESS, maxUint256] }),
        label: "approve Permit2 (aToken)",
      },
    ];
  },

  resultToken(cfg): `0x${string}` {
    return cfg.aToken;
  },
};
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/defi/aaveSupply.test.ts`.
- [ ] **Step 5: Commit** — `git add src/defi/primitives/aaveSupply.ts tests/defi/aaveSupply.test.ts && git commit -m "feat(defi): aave v3 supply adapter"`

---

## Chunk 3: Registry + Runner

### Task 7: Registry (id → {kind,cfg}) + ADAPTERS map

**Files:**
- Create: `src/defi/registry.ts`

The registry is config-only data + the `kind → adapter` resolver. Concrete testnet addresses are filled at E2E time (Task 10); ship the structure with the mock-vault placeholder so it typechecks.

- [ ] **Step 1: Create `src/defi/registry.ts`**

```ts
import type { PrimitiveAdapter, PrimitiveKind } from "./types.js";
import { swapAdapter, type SwapCfg } from "./primitives/swap.js";
import { vault4626Adapter, type Vault4626Cfg } from "./primitives/vault4626.js";
import { aaveSupplyAdapter, type AaveSupplyCfg } from "./primitives/aaveSupply.js";

export const ADAPTERS: Record<PrimitiveKind, PrimitiveAdapter<any>> = {
  swap: swapAdapter,
  vault4626: vault4626Adapter,
  aaveSupply: aaveSupplyAdapter,
};

export type RegistryEntry =
  | { kind: "swap"; cfg: SwapCfg }
  | { kind: "vault4626"; cfg: Vault4626Cfg }
  | { kind: "aaveSupply"; cfg: AaveSupplyCfg };

/** Human id -> primitive instance. Addresses are env/testnet-specific; filled at setup. */
export const registry: Record<string, RegistryEntry> = {
  // populated by scripts/defi-e2e.ts setup (mock vault) and real deployments
};

export function resolve(registryId: string): { entry: RegistryEntry; adapter: PrimitiveAdapter<any> } {
  const entry = registry[registryId];
  if (!entry) throw new Error(`unknown defi registry id: ${registryId}`);
  return { entry, adapter: ADAPTERS[entry.kind] };
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 3: Commit** — `git add src/defi/registry.ts && git commit -m "feat(defi): registry + kind->adapter map"`

---

### Task 8: Runner `runPrivateDefi`

**Files:**
- Create: `src/defi/run.ts`
- Test: `tests/defi/run.test.ts`

The runner is tested against a **mock Unlink client** exposing `executionAccounts.reserve` and `execute`. Assertions: (1) reserve called with `{policy:"fresh"}`; (2) order — previewMin runs before buildCalls (we use an adapter spy); (3) execute called with `allocationPolicy:"by_index"`, `accountIndex` from reserve, and `depositBack.amount === minOut`; (4) `slippageBps:0` throws unless `allowZeroSlippage`; (5) execute rejection is wrapped in `DefiExecuteError` carrying the reserved execAccount.

**Permit2 layering note:** before first real run, confirm against the SDK whether `depositBack` needs only the ERC-20→Permit2 approve (already in each adapter) or also a `Permit2.approve(token, spender, ...)` inner call. If the latter, add it to each adapter's `buildCalls` (one extra call; still ≤ 16). Tracked in the spec §2.1.

- [ ] **Step 1: Write failing test `tests/defi/run.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { runPrivateDefi } from "../../src/defi/run.js";
import { registry } from "../../src/defi/registry.js";
import { DefiExecuteError } from "../../src/defi/errors.js";

// Register a fake entry whose adapter we can observe via the real ADAPTERS path.
// Simpler: inject a stub registry entry + stub adapter through the runner's seam.
function mockClient(executeImpl?: () => Promise<any>) {
  return {
    executionAccounts: {
      reserve: vi.fn().mockResolvedValue({
        account_address: "0x9999999999999999999999999999999999999999",
        account_index: 7,
      }),
    },
    execute: vi.fn(executeImpl ?? (async () => ({ status: "confirmed", executionId: "exec-1" }))),
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
    const res = await runPrivateDefi(client as any, publicClient, "test-id", {
      token, amount: 1_000_000n, slippageBps: 50,
    }, { entry: { kind: "vault4626", cfg: {} as any }, adapter });

    expect(client.executionAccounts.reserve).toHaveBeenCalledWith({ policy: "fresh" });
    // previewMin before buildCalls
    expect(adapter.previewMin.mock.invocationCallOrder[0])
      .toBeLessThan(adapter.buildCalls.mock.invocationCallOrder[0]);
    const execArg = client.execute.mock.calls[0][0];
    expect(execArg.allocationPolicy).toBe("by_index");
    expect(execArg.accountIndex).toBe(7);
    expect(execArg.depositBack.amount).toBe("980000");
    expect(res.minOut).toBe(980_000n);
  });

  it("rejects slippageBps=0 unless allowZeroSlippage", async () => {
    const client = mockClient();
    const adapter = { kind: "swap", previewMin: vi.fn(), buildCalls: vi.fn(), resultToken: vi.fn() };
    await expect(runPrivateDefi(client as any, {} as any, "id", { token, amount: 1n, slippageBps: 0 },
      { entry: { kind: "swap", cfg: {} as any }, adapter: adapter as any })).rejects.toThrow(/slippage/i);
  });

  it("wraps execute failures in DefiExecuteError with the reserved execAccount", async () => {
    const client = mockClient(async () => { throw new Error("batch reverted"); });
    const adapter = {
      kind: "swap" as const,
      previewMin: vi.fn().mockResolvedValue(1n),
      buildCalls: vi.fn().mockReturnValue([]),
      resultToken: vi.fn().mockReturnValue("0xaaaa"),
    };
    await expect(runPrivateDefi(client as any, {} as any, "id", { token, amount: 1n, slippageBps: 50 },
      { entry: { kind: "swap", cfg: {} as any }, adapter })).rejects.toMatchObject({
        name: "DefiExecuteError",
        execAccount: "0x9999999999999999999999999999999999999999",
      });
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/defi/run.test.ts`.

- [ ] **Step 3: Create `src/defi/run.ts`**

```ts
import type { PublicClient } from "viem";
import type { PreviewContext, PrimitiveAdapter } from "./types.js";
import { DefiExecuteError } from "./errors.js";
import { resolve, type RegistryEntry } from "./registry.js";

export interface RunOptions {
  token: `0x${string}`;
  amount: bigint;
  slippageBps?: number;
  allowZeroSlippage?: boolean;
}

export interface RunResult {
  result: unknown;       // Unlink execute() result (status, executionId)
  execAccount: `0x${string}`;
  minOut: bigint;
}

function randomU128Decimal(): string {
  // 16 random bytes -> decimal string. Permit2 unordered nonce.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n.toString();
}

/**
 * Run a private DeFi action: reserve a FRESH ExecutionAccount, preview the
 * conservative output, build the atomic batch, and execute with a fixed-amount
 * depositBack (amount = minOut). `resolved` is injectable for testing; defaults
 * to the registry lookup.
 */
export async function runPrivateDefi(
  client: any,                    // UnlinkClient (seed-backed)
  publicClient: PublicClient,
  registryId: string,
  opts: RunOptions,
  resolved?: { entry: RegistryEntry; adapter: PrimitiveAdapter<any> },
): Promise<RunResult> {
  const slippageBps = opts.slippageBps ?? 50;
  if (slippageBps === 0 && !opts.allowZeroSlippage) {
    throw new Error("slippageBps=0 is not allowed outside demo mode (allowZeroSlippage)");
  }
  const { entry, adapter } = resolved ?? resolve(registryId);

  // 1. FRESH ExecutionAccount (privacy invariant)
  const exec = await client.executionAccounts.reserve({ policy: "fresh" });
  const previewCtx: PreviewContext = {
    execAccount: exec.account_address, token: opts.token, amount: opts.amount, slippageBps,
  };

  // 2. preview FIRST (resolves the circular ordering; no funds moved yet)
  const minOut = await adapter.previewMin(entry.cfg, previewCtx, publicClient);
  const ctx = { ...previewCtx, minOut };

  // 3. build the batch (uses ctx.minOut for amountOutMinimum)
  const calls = adapter.buildCalls(entry.cfg, ctx);

  // 4. execute by_index against the reserved account; depositBack the result token
  try {
    const result = await client.execute({
      token: opts.token,
      amount: opts.amount.toString(),
      calls,
      depositBack: {
        token: adapter.resultToken(entry.cfg, ctx),
        amount: minOut.toString(),
        nonce: randomU128Decimal(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
      },
      allocationPolicy: "by_index",
      accountIndex: exec.account_index,
    });
    return { result, execAccount: exec.account_address, minOut };
  } catch (err) {
    throw new DefiExecuteError(err, { execAccount: exec.account_address, registryId });
  }
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run tests/defi/run.test.ts`.
- [ ] **Step 5: Full suite + typecheck** — `npm test && npx tsc --noEmit` — Expected: all green.
- [ ] **Step 6: Commit** — `git add src/defi/run.ts tests/defi/run.test.ts && git commit -m "feat(defi): runPrivateDefi runner (reserve fresh, by_index, fixed depositBack)"`

---

## Chunk 4: Integration + E2E

### Task 9: Wire into ShadeAgent + node context

**Files:**
- Modify: `src/sdk/index.ts` (add `runDefi` method to `ShadeAgent`)

Add a `publicClient` handle (the agent already builds one inside `evmProvider`; expose or rebuild a read client) and a `runDefi(registryId, amountHuman, { slippageBps })` method that calls `runPrivateDefi(this.client, publicClient, registryId, {...})`. Keep it thin.

- [ ] **Step 1: Add `runDefi` to `ShadeAgent`** (after `withdraw`)

```ts
/** Run a private DeFi action (swap / vault / aave-supply) by registry id. */
async runDefi(registryId: string, amountHuman: string, opts: { slippageBps?: number } = {}) {
  await this.ready();
  const { runPrivateDefi } = await import("../defi/run.js");
  const publicClient = createPublicClient({ chain: resolveChain(this.environment).viemChain, transport: http(this.rpcUrl) });
  return runPrivateDefi(this.client as any, publicClient as any, registryId, {
    token: this.token as `0x${string}`,
    amount: BigInt(toBaseUnits(amountHuman, this.decimals)),
    slippageBps: opts.slippageBps ?? 50,
  });
}
```

(Adjust imports: `createPublicClient`, `http` already imported; store `this.rpcUrl` in the constructor if not present.)

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 3: Commit** — `git add src/sdk/index.ts && git commit -m "feat(defi): ShadeAgent.runDefi wiring"`

---

### Task 10: Mock ERC-4626 vault + E2E (vault primitive)

**Files:**
- Create: `contracts/MockERC4626.sol`, `scripts/deploy-mock-vault.ts`, `scripts/defi-e2e.ts`

This is the **goal-critical E2E**: prove reserve → execute → depositBack on testnet with the vault primitive. The mock is a minimal gateless OZ ERC-4626 over the configured test token, with a seeded dead-deposit.

**Decision on deployment:** if `solc`/foundry isn't available in-repo, deploy the mock via a precompiled bytecode constant embedded in `deploy-mock-vault.ts` (viem `deployContract`) to avoid adding a Solidity toolchain. Document the source in `contracts/MockERC4626.sol` for auditability.

- [ ] **Step 1: Write `contracts/MockERC4626.sol`** (OZ ERC4626, no gate; constructor seeds a dead-deposit to `0x..dEaD`).
- [ ] **Step 2: Write `scripts/deploy-mock-vault.ts`** — deploys the mock against `config.testToken`, prints the vault address; performs the dead-deposit.
- [ ] **Step 3: Register the vault** — add a `registry["mock-vault-usdc"] = { kind: "vault4626", cfg: { vault, asset: config.testToken, requiresUngatedVault: true } }` (via an env-driven setup in `defi-e2e.ts`, not hard-coded addresses in `registry.ts`).
- [ ] **Step 4: Write `scripts/defi-e2e.ts`** — builds a node Unlink context (`createNodeUnlinkContext`), funds the private budget if needed, runs `runPrivateDefi(client, publicClient, "mock-vault-usdc", { token, amount, slippageBps: 50 })`, asserts `result.status` and that the private balance reflects the deposited shares.
- [ ] **Step 5: Run E2E** — `npx tsx scripts/defi-e2e.ts` — Expected: prints reserved execAccount, execution id, and a confirmed deposit-back of shares. **If env secrets / testnet faucet are unavailable, capture the exact blocker** (this is reported in the synthesis, not faked).
- [ ] **Step 6: Commit** — `git add contracts/ scripts/deploy-mock-vault.ts scripts/defi-e2e.ts && git commit -m "feat(defi): mock ERC-4626 vault + testnet E2E for vault primitive"`

---

### Task 11: /spy privacy check (no Exec↔identity link)

**Files:**
- Read/verify: `src/spy/private-activity.ts`, `src/spy/private-run.ts`

Confirm a DeFi action surfaces on the **private rail** as an uncorrelated fresh ExecutionAccount (noise), with no field linking it to the bot identity or pool. If the spy reconstruction needs a hook for defi executions, add a minimal one mirroring how oracle payments appear; otherwise just assert the invariant in a short test/inspection.

- [ ] **Step 1: Inspect** the private-activity reconstruction for any field that could leak Exec↔identity for an execute() action.
- [ ] **Step 2: If needed**, add a defi event shape mirroring oracle-payment noise; else document that no leak path exists.
- [ ] **Step 3: Commit** (if changes) — `git commit -m "chore(defi): verify /spy private rail shows defi as uncorrelated noise"`

---

## Final verification (goal §9 checklist)

- [ ] `npm test` — all defi unit tests green (preview, swap, vault4626, aaveSupply, run).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `fresh` policy on every atomic action (runner hardcodes `{policy:"fresh"}`).
- [ ] depositBack returns the result token; amount = previewed minOut (slippage-adjusted).
- [ ] slippage non-zero enforced (runner guard) for swap + vault; aave not hard-zeroed.
- [ ] vault gate pre-flight (`maxDeposit`) + dead-deposit on the mock.
- [ ] seed-backed client confirmed for both ShadeAgent (`fromEthereumSignature`) and node (`fromMnemonic`).
- [ ] `/spy` private rail: no Exec↔identity link.
- [ ] ≥1 primitive (vault4626) E2E on testnet — OR documented blocker.

**On completion:** stop and produce the synthesis (what works, what's mocked, remaining risks — Permit2 layering confirmation, execute() rollback semantics, remote-mode execute, real-protocol vault availability on Arc — and out-of-scope §10).
