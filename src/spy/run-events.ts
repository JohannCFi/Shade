import type { Action, BtcSignal } from "../agent/strategy.js";

/**
 * One event in the live transparent run, streamed (as NDJSON) from the run route
 * to the /spy client. Kept free of viem imports so the browser can import the
 * type without bundling node-only code.
 */
export type RunEvent =
  | { kind: "start"; explorerBase: string; agent: `0x${string}` }
  | { kind: "fund"; hash: `0x${string}` }
  | { kind: "pay"; tick: number; oracle: "ETH" | "BTC"; amount: string; hash: `0x${string}` }
  | { kind: "decide"; tick: number; action: Action; ethPrice: number; btcSignal: BtcSignal }
  | { kind: "private"; payments: number; sellersReceived: { label: string; amount: string }[] }
  | { kind: "done"; agent: `0x${string}` }
  | { kind: "error"; message: string };
