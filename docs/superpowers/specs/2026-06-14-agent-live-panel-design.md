# Agent live panel — prove the right side is working (design)

**Date:** 2026-06-14 · **Branch:** `feat/agent-live-panel`

## Problem
On `/spy`, the left panel (bare x402, transparent) fills with a fully reconstructed
agent — funder, oracles, budget, strategy. The right panel (same agent on Unlink)
stays `∅ / noise / unreadable` **because** a spy genuinely can't read it. Correct,
but it *looks* like nothing is happening on the right. We need to keep proving the
spy can't reconstruct the strategy **and** prove the agent is really working.

## Solution in one line
Add a **full-width "AGENT · ground truth" panel above the two existing spy panels**.
As the agent runs, its real transactions stream into the top panel row-by-row (with
clickable ArcScan hashes); the two spy panels below fill **progressively** from the
same activity — left reconstructs everything, right stays blind. The contrast is now
legible: you *see* the agent work up top, and the right panel's silence reads as a
**win**, not a dead screen.

## Non-goals
- Do **not** touch the left panel's content, the landing, `/app`, or the custody model.
- **No** live Unlink (private) run wired into the demo — too much failure surface in a
  demo (depends on a funded pool, slower). Private-payment proof is **on demand**
  (see "Right side").
- No change to `reconstruct()` logic, oracle routes, or chain-reader.

## Layout (validated with the user)
```
┌─────────────────────────────────────────────────────────┐
│  AGENT · ground truth            ● live · tick 2/3        │  ← new, full width
│  t1  query ETH oracle   0.001 USDC   0x9f3a…21bd ↗        │
│  t1  query BTC oracle   0.001 USDC   0x4c0e…88a2 ↗        │
│  t1  decide → BUY       eth 3,420 · btc 67k     —         │
│  t2  query ETH oracle   0.001 USDC   0x1ad7…f0c4 ↗        │
│  t2  query BTC oracle   0.001 USDC   …mining             │
└─────────────────────────────────────────────────────────┘
      ▼ each Tx above feeds both spy views below ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│ x402 transparent  ●exposed│ │ Unlink private ○unreadable│
│ Funder   0x77c2…4d1a      │ │ Funder   ∅ no link        │
│ Oracles  ETH ×2 · BTC ×2  │ │ Oracles  ▓░▒▓ noise ▒░▓   │
│ Budget   0.008 USDC       │ │ Budget   —                │
│ Strategy "buy ETH-led"    │ │ Strategy ▓▒░ unreadable   │
└───────────────────────────┘ └───────────────────────────┘
```
The two spy panels keep their **current component and styling** unchanged; only the
moment they populate changes (progressive, as hashes land).

## What the top panel streams
The agent's real loop (`runAgent` in `src/agent/loop.ts`) already yields, per tick:
`ethPrice`, `btcSignal`, `action` (BUY/SELL/HOLD), and two payment receipts. The top
panel renders, in order, one row per event:
- `t{n} · query ETH oracle · 0.001 USDC · <hash ↗>`
- `t{n} · query BTC oracle · 0.001 USDC · <hash ↗>`
- `t{n} · decide → {ACTION} · eth {price} · btc {signal}` (no hash; it's a decision)

Hashes are **real** Arc transactions from the transparent run (`transparent-run.ts`),
each linking to `…/tx/<hash>` on ArcScan. The point we're making: *here are the real
transactions — verify them yourself — and the spy on the right still can't tell who
paid whom or what strategy produced them.*

## Live mechanism (true streaming)
Today `runTransparentAgent` does all ticks then returns one blob, and the client
polls `/api/spy`. That can't show Tx "as they pass." Changes:

1. **`runTransparentAgent` → async generator.** Refactor it to `yield` a typed event
   as each tx is mined, instead of returning at the end:
   - `{ kind: "fund", hash }` (funder→agent edge)
   - `{ kind: "pay", tick, oracle: "ETH"|"BTC", amount, hash }`
   - `{ kind: "decide", tick, action, ethPrice, btcSignal }`
   - `{ kind: "done", agent }`
   The existing return shape (`{ agent, ticks }`) is reconstructed from the stream so
   `scripts/spy-live.ts` and tests keep working (the generator is wrapped by a small
   `runTransparentAgent()` that drains it for non-streaming callers).
2. **`/api/spy/run-transparent` streams.** Return a `ReadableStream` of NDJSON
   (one JSON event per line, `Content-Type: application/x-ndjson`). Keep `runtime =
   "nodejs"`, `maxDuration = 120`. On error, emit a final `{ kind: "error", message }`
   line and close.
3. **Client (`app/spy/page.tsx`) consumes the stream.** Read the response body with a
   reader + line buffer. For each event:
   - append a row to the new top panel (`AgentLog` state);
   - when a `pay`/`fund` hash lands, re-fetch the **left** rail (`fetchRail("transparent")`)
     so it reconstructs progressively;
   - re-fetch the **right** rail too (it stays blind — and we *see* it stay blind).
   On `done`, do a final `refresh()`. The existing non-stream `refresh()` and
   `fetchRail()` stay as-is for initial load and the "Refresh from chain" button.

## Right side — on-demand engine proof
The right spy panel keeps reading the **public** chain → always blind (by design).
To answer the skeptic ("did the agent actually pay privately?") we add an
**owner-only proof**, reusing the `scripts/check-activity.ts` pattern:
- New route `GET /api/spy/verify-private` → uses `admin.users.getTransactions` +
  `admin.users.getBalances` (ETH/BTC seller balances) via the Unlink admin SDK.
  Returns `{ agentTxCount, sellersReceived: [{label, amount}] }`. Server-only (admin
  API key never reaches the browser).
- In the right panel, a small **"✓ verify on engine"** affordance. On click it calls
  the route and reveals: *"N private payments confirmed via the Unlink engine ·
  invisible on the explorer."* This is the owner's private view — the exact asymmetry:
  provable to the owner, unreadable to the spy.

## Components / boundaries
- `src/spy/transparent-run.ts` — add `runTransparentAgentStream()` (async generator);
  keep `runTransparentAgent()` as a thin drain wrapper. One purpose: produce real
  on-chain activity and report each step.
- `app/api/spy/run-transparent/route.ts` — adapt to stream NDJSON from the generator.
- `app/api/spy/verify-private/route.ts` — new, owner engine proof (read-only).
- `app/spy/page.tsx` — add `<AgentLog>` (new top panel) + stream consumer; wire the
  right panel's verify affordance. The two `<SpyPanel>`s are untouched in markup.
- `app/spy/_components/AgentLog.tsx` — new presentational component for the stream
  (rows, live pulse, ArcScan links). Pure render from a `rows` array.

## Data flow
```
[Run agent live]
   → POST /api/spy/run-transparent (NDJSON stream)
       runTransparentAgentStream(): per tx mined → emit event line
   → client reads events:
       • append row to AgentLog (top)
       • on hash → fetchRail("transparent")  ⇒ LEFT fills progressively
       • fetchRail("unlink")                 ⇒ RIGHT stays blind
   → on done → refresh()
[✓ verify on engine]  (right panel, on demand)
   → GET /api/spy/verify-private → engine balances/txs → "N private payments confirmed"
```

## Error handling
- Stream error → emit `{ kind: "error", message }`, client shows it in the existing
  `status` line, stops the pulse, leaves already-streamed rows in place.
- `verify-private` failure (no key / pool empty) → the affordance shows a muted
  "engine unavailable" rather than breaking the page.
- Run button disabled while a stream is in flight (existing `running` flag).
- Reading the chain right after a tx can lag indexing → keep the existing retry feel
  (the left panel may fill a row or two behind the top; that's acceptable and even
  reinforces "reconstruction takes effort").

## Testing
- `transparent-run` generator: unit test with a faked viem client (writeContract /
  waitForTransactionReceipt stubs) asserting the event sequence
  (fund → pay×2 per tick → decide → done) and that the drain wrapper returns the same
  `{ agent, ticks }` as before. Mirrors `tests/spy.test.ts` style.
- Route streaming: assert NDJSON lines parse and the final line is `done` (or `error`).
- `verify-private`: unit test with a faked admin returning known balances/txs →
  asserts the `{ agentTxCount, sellersReceived }` shape.
- Keep existing `tests/spy.test.ts` green (no `reconstruct()` change).

## Out of scope (YAGNI)
- Real live Unlink private run in the demo loop.
- Persisting/replaying past runs; websockets (NDJSON over fetch is enough).
- Any change to the left panel's reconstruction or to `/app`.
