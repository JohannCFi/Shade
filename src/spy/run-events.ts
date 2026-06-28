import type { Action, BtcSignal } from "../agent/strategy.js";

/**
 * One event in the live transparent run, streamed (as NDJSON) from the run route
 * to the /spy client. Kept free of viem imports so the browser can import the
 * type without bundling node-only code.
 */
export type DefiPrimitive = "swap" | "vault4626" | "aaveSupply";

/** One private DeFi action confirmed on the private rail (uncorrelated). */
export interface PrivateDefiAction {
  label: string;
  primitive: DefiPrimitive;
  /** The ephemeral ExecutionAccount used — fresh, unlinkable to the agent. */
  execAccount: string;
  status: string;
}

export type RunEvent =
  | { kind: "start"; explorerBase: string; agent: `0x${string}` }
  | { kind: "fund"; hash: `0x${string}` }
  | { kind: "pay"; tick: number; oracle: "ETH" | "BTC"; amount: string; hash: `0x${string}` }
  | { kind: "decide"; tick: number; action: Action; ethPrice: number; btcSignal: BtcSignal }
  // The agent acts on its decision — a REAL, visible capital allocation on the
  // transparent rail. This is the second thing that leaks: not just which signals
  // the agent reads, but what it does with its money.
  | {
      kind: "trade";
      label: string;
      primitive: DefiPrimitive;
      venue: `0x${string}`;
      amount: string;
      hash: `0x${string}`;
    }
  | {
      kind: "private";
      payments: number;
      sellersReceived: { label: string; amount: string }[];
      /** Public on-chain withdrawals proving the private value really landed. */
      withdrawals: { label: string; hash: string }[];
      /** Private DeFi allocations run via execute() this run — invisible on-chain. */
      defi?: { attempted: number; executed: number; actions: PrivateDefiAction[] };
      explorerBase: string;
    }
  | { kind: "done"; agent: `0x${string}` }
  | { kind: "error"; message: string };
