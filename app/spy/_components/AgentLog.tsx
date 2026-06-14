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

const rowKey = (e: RunEvent, i: number) =>
  e.kind === "decide" ? `decide-${e.tick}` : `${e.kind}-${"hash" in e ? e.hash : i}`;

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
          <p className="font-mono text-xs text-faint">Press "Run agent live" to stream the agent's real transactions.</p>
        ) : (
          <ul className="space-y-0.5">
            {rows.map((e, i) => (
              <li key={rowKey(e, i)} className="grid grid-cols-[2.2rem_1fr_auto_8rem] items-baseline gap-3 border-b border-[var(--line)] py-1.5 font-mono text-xs last:border-0">
                <span className="text-faint">{"tick" in e ? `t${e.tick + 1}` : "init"}</span>
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
