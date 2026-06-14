# Agent Live Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-width "AGENT · ground truth" panel above the two `/spy` panels that streams the agent's real transactions live (with ArcScan links) while the left spy panel reconstructs them progressively and the right stays blind — plus an on-demand engine proof that the private payments really landed.

**Architecture:** Refactor the transparent run into an async generator that yields one typed `RunEvent` per mined tx; stream those events from the API route as NDJSON; the client reads the stream, appends rows to the new panel and re-reads both spy rails as hashes land. A separate read-only route proves private activity via the Unlink engine. All non-I/O logic (event sequencing, NDJSON serialize/parse, activity summary) is extracted into pure, unit-tested helpers; UI components stay presentational and untested (consistent with this repo's node-only vitest setup).

**Tech Stack:** Next.js App Router (Node runtime), viem, `@unlink-xyz/sdk`, vitest (node env), TypeScript ESM (`.js` import specifiers).

**Spec:** `docs/superpowers/specs/2026-06-14-agent-live-panel-design.md`

---

## File Structure

**New files**
- `src/spy/run-events.ts` — the `RunEvent` wire type only (no viem import), shared by server + client.
- `src/spy/ndjson.ts` — `ndjsonStream()` (server serialize) + `parseNdjsonLines()` (client buffer parse); two sides of one wire format.
- `src/spy/private-activity.ts` — `summarizePrivateActivity()` pure helper for the engine proof.
- `app/api/spy/verify-private/route.ts` — read-only owner engine proof.
- `app/spy/_components/AgentLog.tsx` — presentational top panel.
- `tests/transparent-run-stream.test.ts`, `tests/ndjson.test.ts`, `tests/private-activity.test.ts`.

**Modified files**
- `src/spy/transparent-run.ts` — add `runTransparentAgentStream()` generator + IO seam; keep `runTransparentAgent()` as a thin (now io-injectable) drain wrapper.
- `app/api/spy/run-transparent/route.ts` — stream NDJSON from the generator.
- `app/spy/page.tsx` — add `<AgentLog>`, consume the stream, wire the right-panel verify affordance.

**Untouched:** `src/spy/reconstruct.ts`, `src/spy/chain-reader.ts`, `src/spy/agents.ts`, the `<SpyPanel>`/`<Row>` markup, the left panel's content, oracle routes, `/app`.

---

## Chunk 1: Streaming core (pure, testable backend)

### Task 1: `RunEvent` wire type

**Files:**
- Create: `src/spy/run-events.ts`

- [ ] **Step 1: Create the type module**

```ts
import type { Action, BtcSignal } from "../agent/strategy.js";

/**
 * One event in the live transparent run, streamed (as NDJSON) from the run route
 * to the /spy client. Kept free of viem imports so the browser can import the
 * type without bundling node-only code.
 */
export type RunEvent =
  | { kind: "start"; explorerBase: string }
  | { kind: "fund"; hash: `0x${string}` }
  | { kind: "pay"; tick: number; oracle: "ETH" | "BTC"; amount: string; hash: `0x${string}` }
  | { kind: "decide"; tick: number; action: Action; ethPrice: number; btcSignal: BtcSignal }
  | { kind: "done"; agent: `0x${string}` }
  | { kind: "error"; message: string };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/spy/run-events.ts
git commit -m "feat(spy): add RunEvent wire type for live agent stream"
```

---

### Task 2: `runTransparentAgentStream` generator + IO seam

**Files:**
- Modify: `src/spy/transparent-run.ts`
- Test: `tests/transparent-run-stream.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  runTransparentAgentStream,
  runTransparentAgent,
  type TransparentRunIO,
} from "../src/spy/transparent-run.js";
import type { RunEvent } from "../src/spy/run-events.js";

// Standard throwaway test mnemonic — only used to derive deterministic oracle addrs.
const MNEMONIC = "test test test test test test test test test test test junk";
const TOKEN = "0x3600000000000000000000000000000000000000";

function fakeIo(): TransparentRunIO {
  let n = 0;
  return {
    agent: "0x0000000000000000000000000000000000000006",
    fund: async () => "0xfund" as `0x${string}`,
    payOracle: async () => (`0xpay${n++}` as `0x${string}`),
  };
}

async function collect(ticks: number): Promise<RunEvent[]> {
  const out: RunEvent[] = [];
  for await (const e of runTransparentAgentStream({ mnemonic: MNEMONIC, token: TOKEN, ticks }, fakeIo())) {
    out.push(e);
  }
  return out;
}

describe("runTransparentAgentStream", () => {
  it("emits start → fund → (pay ETH, pay BTC, decide)×ticks → done", async () => {
    const kinds = (await collect(2)).map((e) => e.kind);
    expect(kinds).toEqual([
      "start", "fund",
      "pay", "pay", "decide",
      "pay", "pay", "decide",
      "done",
    ]);
  });

  it("carries deterministic decision data on each decide event", async () => {
    const decides = (await collect(2)).filter((e): e is Extract<RunEvent, { kind: "decide" }> => e.kind === "decide");
    expect(decides).toHaveLength(2);
    expect(typeof decides[0].ethPrice).toBe("number");
    expect(["BUY", "SELL", "HOLD"]).toContain(decides[0].action);
  });

  it("clamps ticks into [1,5]", async () => {
    const count = async (t: number) => (await collect(t)).filter((e) => e.kind === "decide").length;
    expect(await count(0)).toBe(1);
    expect(await count(99)).toBe(5);
  });

  it("runTransparentAgent drains the stream to { agent, ticks }", async () => {
    const res = await runTransparentAgent({ mnemonic: MNEMONIC, token: TOKEN, ticks: 3 }, fakeIo());
    expect(res.ticks).toBe(3);
    expect(res.agent).toBe("0x0000000000000000000000000000000000000006");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/transparent-run-stream.test.ts`
Expected: FAIL (`runTransparentAgentStream`/`TransparentRunIO` not exported).

- [ ] **Step 3: Rewrite `src/spy/transparent-run.ts`**

Replace the whole file with the streaming version (preserves the original real-chain behavior inside `makeRealIo`):

```ts
import { createWalletClient, createPublicClient, http, erc20Abi, parseEther } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { resolveChain } from "../chain/chains.js";
import { decide } from "../agent/strategy.js";
import { ethPriceAt, btcSignalAt } from "../oracle/feed.js";
import { deriveSpyAddresses, type SpyAddresses } from "./agents.js";
import type { RunEvent } from "./run-events.js";

export interface TransparentRunOpts {
  mnemonic: string;
  token: string;
  tokenDecimals?: number;
  environment?: string;
  rpcUrl?: string;
  ticks?: number;
}

/** I/O seam: real chain transfers in prod, a fake in tests. */
export interface TransparentRunIO {
  agent: `0x${string}`;
  /** Fund the agent (gas + visible token edge); returns the token funding hash. */
  fund(): Promise<`0x${string}`>;
  /** Pay one oracle `amount` (base units); returns the transfer hash. */
  payOracle(to: `0x${string}`, amount: bigint): Promise<`0x${string}`>;
}

const FALLBACK_EXPLORER = "https://testnet.arcscan.app";

function clampTicks(ticks?: number): number {
  return Math.min(Math.max(ticks ?? 3, 1), 5);
}

function priceFor(decimals: number): bigint {
  return 10n ** BigInt(Math.max(decimals - 3, 0)); // 0.001 token
}

/** Build the real-chain IO (funder index 0, transparent agent index 6). */
function makeRealIo(opts: TransparentRunOpts, addrs: SpyAddresses): TransparentRunIO {
  const chain = resolveChain(opts.environment ?? "arc-testnet");
  const rpcUrl = opts.rpcUrl ?? chain.defaultRpc;
  const token = opts.token as `0x${string}`;
  const ticks = clampTicks(opts.ticks);
  const price = priceFor(opts.tokenDecimals ?? 6);

  const funder = mnemonicToAccount(opts.mnemonic);
  const agent = mnemonicToAccount(opts.mnemonic, { accountIndex: 6 });
  const pub = createPublicClient({ chain: chain.viemChain, transport: http(rpcUrl) });
  const funderWallet = createWalletClient({ account: funder, chain: chain.viemChain, transport: http(rpcUrl) });
  const agentWallet = createWalletClient({ account: agent, chain: chain.viemChain, transport: http(rpcUrl) });

  return {
    agent: agent.address,
    async fund() {
      const gasHash = await funderWallet.sendTransaction({ to: agent.address, value: parseEther("0.02") });
      await pub.waitForTransactionReceipt({ hash: gasHash });
      const fundAmount = price * BigInt(ticks) * 2n + price;
      const fundHash = await funderWallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [agent.address, fundAmount] });
      await pub.waitForTransactionReceipt({ hash: fundHash });
      return fundHash;
    },
    async payOracle(to, amount) {
      const h = await agentWallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [to, amount] });
      await pub.waitForTransactionReceipt({ hash: h });
      return h;
    },
  };
}

/**
 * Run the TRANSPARENT agent for real and stream one event per mined tx:
 * start → fund → (pay ETH, pay BTC, decide) per tick → done. Decision/price data
 * comes from the deterministic feed + strategy (no oracle HTTP); the payments are
 * real, visible on-chain transfers. Pass `io` to unit-test without a chain.
 */
export async function* runTransparentAgentStream(
  opts: TransparentRunOpts,
  io?: TransparentRunIO,
): AsyncGenerator<RunEvent> {
  const ticks = clampTicks(opts.ticks);
  const price = priceFor(opts.tokenDecimals ?? 6);
  const addrs = deriveSpyAddresses(opts.mnemonic);
  const runner = io ?? makeRealIo(opts, addrs);
  const explorerBase = resolveChain(opts.environment ?? "arc-testnet").viemChain.blockExplorers?.default?.url ?? FALLBACK_EXPLORER;

  yield { kind: "start", explorerBase };
  yield { kind: "fund", hash: await runner.fund() };

  let prevEth = 0;
  for (let t = 0; t < ticks; t++) {
    yield { kind: "pay", tick: t, oracle: "ETH", amount: price.toString(), hash: await runner.payOracle(addrs.ethOracle, price) };
    yield { kind: "pay", tick: t, oracle: "BTC", amount: price.toString(), hash: await runner.payOracle(addrs.btcOracle, price) };

    const ethPrice = ethPriceAt(t);
    const btcSignal = btcSignalAt(t);
    const ethPrevPrice = t === 0 ? ethPrice : prevEth;
    const action = decide({ ethPrice, ethPrevPrice, btcSignal });
    yield { kind: "decide", tick: t, action, ethPrice, btcSignal };
    prevEth = ethPrice;
  }

  yield { kind: "done", agent: runner.agent };
}

/** Drain the stream to the legacy summary shape (used by tests / non-stream callers). */
export async function runTransparentAgent(
  opts: TransparentRunOpts,
  io?: TransparentRunIO,
): Promise<{ agent: `0x${string}`; ticks: number }> {
  let agent = "0x0000000000000000000000000000000000000000" as `0x${string}`;
  let ticks = 0;
  for await (const e of runTransparentAgentStream(opts, io)) {
    if (e.kind === "decide") ticks = e.tick + 1;
    if (e.kind === "done") agent = e.agent;
  }
  return { agent, ticks };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/transparent-run-stream.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS (all existing tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/spy/transparent-run.ts tests/transparent-run-stream.test.ts
git commit -m "feat(spy): stream transparent run as per-tx events with an IO seam"
```

---

### Task 3: NDJSON serialize + parse helpers

**Files:**
- Create: `src/spy/ndjson.ts`
- Test: `tests/ndjson.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { ndjsonStream, parseNdjsonLines } from "../src/spy/ndjson.js";

async function* nums() { yield { a: 1 }; yield { b: 2 }; }

describe("ndjsonStream", () => {
  it("serializes an async iterable to newline-delimited JSON", async () => {
    const text = await new Response(ndjsonStream(nums())).text();
    expect(text).toBe('{"a":1}\n{"b":2}\n');
  });

  it("emits a final error line if the source throws", async () => {
    async function* bad() { yield { ok: 1 }; throw new Error("boom"); }
    const text = await new Response(ndjsonStream(bad())).text();
    const lines = text.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0]).toEqual({ ok: 1 });
    expect(lines[1]).toEqual({ kind: "error", message: "boom" });
  });
});

describe("parseNdjsonLines", () => {
  it("parses complete lines and keeps the partial remainder", () => {
    let { lines, rest } = parseNdjsonLines("", '{"a":1}\n{"b"');
    expect(lines).toEqual([{ a: 1 }]);
    expect(rest).toBe('{"b"');
    ({ lines, rest } = parseNdjsonLines(rest, ":2}\n"));
    expect(lines).toEqual([{ b: 2 }]);
    expect(rest).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ndjson.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/spy/ndjson.ts`**

```ts
/**
 * Newline-delimited JSON over a fetch stream. `ndjsonStream` serializes any async
 * iterable to a ReadableStream (server); `parseNdjsonLines` re-assembles whole
 * lines from arbitrarily-chunked text (client). A source error is surfaced as a
 * final `{ kind: "error", message }` line rather than a torn stream.
 */
export function ndjsonStream(source: AsyncIterable<unknown>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) { controller.close(); return; }
        controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      } catch (err) {
        controller.enqueue(encoder.encode(JSON.stringify({ kind: "error", message: (err as Error).message }) + "\n"));
        controller.close();
      }
    },
  });
}

export function parseNdjsonLines(buffer: string, chunk: string): { lines: unknown[]; rest: string } {
  const parts = (buffer + chunk).split("\n");
  const rest = parts.pop() ?? "";
  const lines = parts.filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
  return { lines, rest };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ndjson.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/spy/ndjson.ts tests/ndjson.test.ts
git commit -m "feat(spy): NDJSON stream serialize + chunk-safe line parser"
```

---

## Chunk 2: Routes (streaming run + engine proof)

### Task 4: Stream NDJSON from the run route

**Files:**
- Modify: `app/api/spy/run-transparent/route.ts`

- [ ] **Step 1: Rewrite the route to stream**

```ts
import { runTransparentAgentStream } from "@/src/spy/transparent-run";
import { ndjsonStream } from "@/src/spy/ndjson";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const TOKEN = process.env.UNLINK_TEST_TOKEN ?? "0x3600000000000000000000000000000000000000";

/**
 * Live trigger: run a real transparent agent and STREAM one NDJSON event per
 * mined tx (start/fund/pay/decide/done), so the /spy client fills the agent
 * panel and the left spy panel in real time. POST { ticks?: number } (capped 1–5).
 */
export async function POST(request: Request): Promise<Response> {
  const mnemonic = process.env.WALLET_MNEMONIC;
  if (!mnemonic) {
    return new Response(JSON.stringify({ kind: "error", message: "server not configured" }) + "\n", {
      status: 500,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  const body = await request.json().catch(() => ({}));
  const ticks = Math.min(Math.max(Number(body?.ticks) || 3, 1), 5);

  const events = runTransparentAgentStream({
    mnemonic,
    token: TOKEN,
    tokenDecimals: Number(process.env.UNLINK_TOKEN_DECIMALS ?? "6"),
    environment: process.env.UNLINK_ENVIRONMENT ?? "arc-testnet",
    rpcUrl: process.env.RPC_URL,
    ticks,
  });

  return new Response(ndjsonStream(events), {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store, no-transform",
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Build to confirm the route compiles under Next**

Run: `npx next build`
Expected: PASS (route compiles; build succeeds). If `next build` is too slow/credentialed in your env, skip and rely on `tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add app/api/spy/run-transparent/route.ts
git commit -m "feat(spy): stream the live transparent run as NDJSON"
```

---

### Task 5: Private-activity summary helper

**Files:**
- Create: `src/spy/private-activity.ts`
- Test: `tests/private-activity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { summarizePrivateActivity } from "../src/spy/private-activity.js";

describe("summarizePrivateActivity", () => {
  it("counts agent txs and formats non-zero seller balances to USDC", () => {
    const s = summarizePrivateActivity({
      txCount: 6,
      sellers: [
        { label: "ETH price", amountBaseUnits: "3000" },
        { label: "BTC signal", amountBaseUnits: "3000" },
      ],
    });
    expect(s.agentTxCount).toBe(6);
    expect(s.sellersReceived).toEqual([
      { label: "ETH price", amount: "0.003" },
      { label: "BTC signal", amount: "0.003" },
    ]);
  });

  it("drops sellers that received nothing", () => {
    const s = summarizePrivateActivity({
      txCount: 0,
      sellers: [{ label: "ETH price", amountBaseUnits: "0" }],
    });
    expect(s.sellersReceived).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/private-activity.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/spy/private-activity.ts`**

```ts
import { fromBaseUnits } from "../unlink/config.js";

export interface PrivateActivitySummary {
  agentTxCount: number;
  sellersReceived: { label: string; amount: string }[];
}

/**
 * Shape the owner's private engine view into the right-panel proof: how many
 * agent transactions the engine recorded, and which oracle sellers actually
 * received funds (zero-balance sellers dropped, amounts formatted to USDC).
 */
export function summarizePrivateActivity(input: {
  txCount: number;
  sellers: { label: string; amountBaseUnits: string }[];
}): PrivateActivitySummary {
  return {
    agentTxCount: input.txCount,
    sellersReceived: input.sellers
      .filter((s) => BigInt(s.amountBaseUnits || "0") > 0n)
      .map((s) => ({ label: s.label, amount: fromBaseUnits(s.amountBaseUnits) })),
  };
}
```

> Note: confirm `fromBaseUnits` is exported from `src/unlink/config.ts` (it is used in `scripts/check-activity.ts`). If its formatting drops trailing zeros differently, adjust the expected strings in the test to match its real output — keep the test asserting *real* behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/private-activity.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/spy/private-activity.ts tests/private-activity.test.ts
git commit -m "feat(spy): summarize private engine activity for the right-panel proof"
```

---

### Task 6: `verify-private` engine route

**Files:**
- Create: `app/api/spy/verify-private/route.ts`

**Reference:** mirror the derivation + admin calls in `scripts/check-activity.ts` (agent via `unlinkAccount.fromEthereumSignature` over `buildDeriveSeedMessage`, sellers via `unlinkAccount.fromMnemonic` index 2/3, `admin.users.getTransactions` + `admin.users.getBalances`).

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse } from "next/server";
import { createUnlinkAdmin } from "@unlink-xyz/sdk/admin";
import { account as unlinkAccount } from "@unlink-xyz/sdk/client";
import { buildDeriveSeedMessage } from "@unlink-xyz/sdk/crypto";
import { mnemonicToAccount } from "viem/accounts";
import { config } from "@/src/unlink/config";
import { UNLINK_APP_ID } from "@/src/unlink/browser-client";
import { summarizePrivateActivity } from "@/src/spy/private-activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Owner-only proof that the agent's PRIVATE payments really landed — verifiable
 * via the Unlink engine, invisible on the public explorer. Read-only.
 * GET /api/spy/verify-private
 */
export async function GET(): Promise<NextResponse> {
  try {
    const admin = createUnlinkAdmin({ environment: config.environment, apiKey: config.apiKey });
    const signer = mnemonicToAccount(config.mnemonic);
    const message = buildDeriveSeedMessage({ appId: UNLINK_APP_ID, chainId: config.chain.chainId });
    const signature = await signer.signMessage({ message });
    const agent = unlinkAccount.fromEthereumSignature({ signature, appId: UNLINK_APP_ID, chainId: config.chain.chainId });
    const agentAddr = await agent.getAddress();

    const ethSeller = await unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 2 }).getAddress();
    const btcSeller = await unlinkAccount.fromMnemonic({ mnemonic: config.mnemonic, accountIndex: 3 }).getAddress();

    const txs = await admin.users.getTransactions({ address: agentAddr, limit: 20 });
    const sellerBalance = async (addr: string) => {
      const b = await admin.users.getBalances({ address: addr, token: config.testToken });
      const x = b.balances.find((y) => y.token.toLowerCase() === config.testToken.toLowerCase());
      return x?.amount ?? "0";
    };

    const summary = summarizePrivateActivity({
      txCount: txs.transactions.length,
      sellers: [
        { label: "ETH price", amountBaseUnits: await sellerBalance(ethSeller) },
        { label: "BTC signal", amountBaseUnits: await sellerBalance(btcSeller) },
      ],
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    // Graceful: no creds / empty pool → the panel shows "engine unavailable", page stays alive.
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 200 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (If the SDK's `getTransactions`/`getBalances` field names differ from `scripts/check-activity.ts`, align to that file — it is the working reference.)

- [ ] **Step 3: Commit**

```bash
git add app/api/spy/verify-private/route.ts
git commit -m "feat(spy): owner engine-proof route for private payments"
```

---

## Chunk 3: Frontend (live panel + wiring)

### Task 7: `AgentLog` presentational panel

**Files:**
- Create: `app/spy/_components/AgentLog.tsx`

> No unit test: this repo's vitest is node-only (no jsdom/RTL); UI is verified manually. Keep the component pure — it renders from props, holds no fetch logic.

- [ ] **Step 1: Implement the component**

```tsx
"use client";

import type { RunEvent } from "@/src/spy/run-events";

const usd = (atomic: string) => `${(Number(atomic) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`;
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export interface AgentLogProps {
  events: RunEvent[];
  explorerBase: string;
  running: boolean;
  tick: { current: number; total: number } | null;
}

export function AgentLog({ events, explorerBase, running, tick }: AgentLogProps) {
  const rows = events.filter((e) => e.kind === "fund" || e.kind === "pay" || e.kind === "decide");

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
        <div>
          <div className="font-mono text-sm text-ink">AGENT · ground truth</div>
          <div className="font-mono text-[0.7rem] text-faint">what the agent really does, every tick</div>
        </div>
        {running && (
          <span className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-widest" style={{ color: "var(--faint)" }}>
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#5fd08a", boxShadow: "0 0 8px #5fd08a" }} />
            live{tick ? ` · tick ${tick.current}/${tick.total}` : ""}
          </span>
        )}
      </div>

      <div className="p-5">
        {rows.length === 0 ? (
          <p className="font-mono text-xs text-faint">Press “Run agent live” to stream the agent’s real transactions.</p>
        ) : (
          <ul className="space-y-0.5">
            {rows.map((e, i) => (
              <li key={i} className="grid grid-cols-[2.2rem_1fr_auto_8rem] items-baseline gap-3 border-b border-[var(--line)] py-1.5 font-mono text-xs last:border-0">
                <span className="text-faint">t{("tick" in e ? e.tick : 0) + 1}</span>
                {e.kind === "decide" ? (
                  <>
                    <span className="text-ink">decide → {e.action}</span>
                    <span className="text-faint">eth {Math.round(e.ethPrice).toLocaleString()} · btc {e.btcSignal}</span>
                    <span className="text-right text-faint">—</span>
                  </>
                ) : (
                  <>
                    <span className="text-muted">{e.kind === "fund" ? "fund agent" : `query ${e.oracle} oracle`}</span>
                    <span className="text-faint">{e.kind === "pay" ? usd(e.amount) : "funder edge"}</span>
                    <a className="text-right text-[#7da7c7] hover:underline" href={`${explorerBase}/tx/${e.hash}`} target="_blank" rel="noreferrer">
                      {short(e.hash)} ↗
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/spy/_components/AgentLog.tsx
git commit -m "feat(spy): AgentLog panel rendering the live run stream"
```

---

### Task 8: Wire the stream + panel into `/spy`

**Files:**
- Modify: `app/spy/page.tsx`

- [ ] **Step 1: Add imports and state**

At the top of `app/spy/page.tsx`, add to the existing imports:

```tsx
import { AgentLog } from "./_components/AgentLog";
import { parseNdjsonLines } from "@/src/spy/ndjson";
import type { RunEvent } from "@/src/spy/run-events";
```

Inside `SpyPage`, add state next to the existing `useState` calls:

```tsx
const [events, setEvents] = useState<RunEvent[]>([]);
const [explorerBase, setExplorerBase] = useState("https://testnet.arcscan.app");
const [liveTick, setLiveTick] = useState<{ current: number; total: number } | null>(null);
```

- [ ] **Step 2: Replace `runLive` with the streaming consumer**

```tsx
async function runLive() {
  const totalTicks = 3;
  setRunning(true);
  setEvents([]);
  setLiveTick({ current: 1, total: totalTicks });
  setStatus("Streaming the agent’s real payments on Arc…");
  try {
    const res = await fetch("/api/spy/run-transparent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticks: totalTicks }),
    });
    if (!res.body) throw new Error("no stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const parsed = parseNdjsonLines(buffer, decoder.decode(value, { stream: true }));
      buffer = parsed.rest;
      for (const raw of parsed.lines) {
        const e = raw as RunEvent;
        if (e.kind === "start") { setExplorerBase(e.explorerBase); continue; }
        if (e.kind === "error") throw new Error(e.message);
        setEvents((prev) => [...prev, e]);
        if (e.kind === "decide") setLiveTick({ current: Math.min(e.tick + 2, totalTicks), total: totalTicks });
        if (e.kind === "fund" || e.kind === "pay") {
          // Each new hash → let the spy panels re-read the chain.
          fetchRail("transparent").then(setLeft);
          fetchRail("unlink").then(setRight);
        }
      }
    }

    await refresh();
    setStatus("Done — left reconstructed from the chain; right stayed dark.");
  } catch (e) {
    setStatus(`Failed: ${(e as Error).message}`);
  } finally {
    setRunning(false);
    setLiveTick(null);
  }
}
```

- [ ] **Step 3: Render `<AgentLog>` above the existing grid**

Insert directly before `<div className="mt-12 grid gap-5 md:grid-cols-2">`:

```tsx
<div className="mt-12">
  <AgentLog events={events} explorerBase={explorerBase} running={running} tick={liveTick} />
</div>
```

Change the grid wrapper's margin from `mt-12` to `mt-5` so the spacing stays even:

```tsx
<div className="mt-5 grid gap-5 md:grid-cols-2">
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/spy/page.tsx
git commit -m "feat(spy): stream the live run into the AgentLog + progressive spy panels"
```

---

### Task 9: Right-panel "verify on engine" affordance

**Files:**
- Modify: `app/spy/page.tsx`

- [ ] **Step 1: Add verify state + handler in `SpyPage`**

```tsx
const [verify, setVerify] = useState<string | null>(null);
async function verifyPrivate() {
  setVerify("Checking the Unlink engine…");
  try {
    const j = await fetch("/api/spy/verify-private", { cache: "no-store" }).then((r) => r.json());
    if (!j.ok) { setVerify("Engine unavailable — run the agent on the private rail first."); return; }
    const sellers = (j.sellersReceived as { label: string; amount: string }[]).map((s) => `${s.label} ${s.amount}`).join(" · ");
    setVerify(`${j.agentTxCount} private payments confirmed via the engine — invisible on the explorer.${sellers ? ` (${sellers})` : ""}`);
  } catch (e) {
    setVerify(`Engine error: ${(e as Error).message}`);
  }
}
```

- [ ] **Step 2: Pass verify props to the private `<SpyPanel>`**

Update the right `<SpyPanel>` usage:

```tsx
<SpyPanel
  tone="private"
  rail="Unlink, private"
  subtitle="same agent, shielded"
  report={right.report}
  txs={right.txs}
  onVerify={verifyPrivate}
  verifyText={verify}
/>
```

- [ ] **Step 3: Extend `SpyPanel` to render the affordance**

Add the two optional props to `SpyPanel`'s signature:

```tsx
function SpyPanel({ tone, rail, subtitle, report, txs, onVerify, verifyText }: {
  tone: "exposed" | "private";
  rail: string;
  subtitle: string;
  report: SpyReport | null;
  txs: SpyTx[];
  onVerify?: () => void;
  verifyText?: string | null;
}) {
```

Then, inside the private branch, just after the existing `{!readable && (...)}` block, add:

```tsx
{onVerify && (
  <div className="mt-4 border-t border-[var(--line)] pt-4">
    <button className="btn-ghost !py-1.5 !text-xs" onClick={onVerify}>✓ verify on engine</button>
    {verifyText && <p className="mt-2 font-mono text-[0.7rem] text-faint">{verifyText}</p>}
  </div>
)}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Full test suite**

Run: `npx vitest run`
Expected: PASS (all green — no logic regressions).

- [ ] **Step 6: Manual verification (see skill `@superpowers:verification-before-completion`)**

Run the dev server (`npm run dev`), open `/spy`, click **Run agent live**, and confirm:
- the AGENT panel streams rows with live ArcScan links as txs are mined;
- the left spy panel fills progressively, the right stays `∅ / noise / unreadable`;
- **✓ verify on engine** on the right reveals the confirmed private-payment count (or a graceful "engine unavailable").

- [ ] **Step 7: Commit**

```bash
git add app/spy/page.tsx
git commit -m "feat(spy): on-demand engine proof in the private spy panel"
```

---

## Done criteria
- `npx vitest run` green (3 new test files + existing suite).
- `/spy` shows a live-streaming AGENT panel above two progressively-filling spy panels; left reconstructs, right stays blind.
- Right panel can prove private payments via the engine on demand.
- Left panel content, `reconstruct()`, oracle routes, and `/app` are unchanged.
