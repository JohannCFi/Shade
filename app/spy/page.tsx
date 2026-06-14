"use client";

import { useCallback, useEffect, useState } from "react";
import { Nav } from "../_components/Hero";
import { AgentLog } from "./_components/AgentLog";
import { parseNdjsonLines } from "@/src/spy/ndjson";
import type { RunEvent } from "@/src/spy/run-events";

interface OracleUsage { oracle: string; label?: string; calls: number; totalSpent: string }
interface SpyReport {
  readable: boolean;
  payer: string | null;
  funder: string | null;
  oracles: OracleUsage[];
  totalSpent: string;
  inferredStrategy: string | null;
}
interface SpyTx { hash: string; url: string; kind: "out" | "in"; label: string; amount: string }
interface RailData { report: SpyReport | null; txs: SpyTx[] }

const usd = (atomic: string) => `${(Number(atomic) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`;
const short = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "-");

async function fetchRail(rail: "transparent" | "unlink"): Promise<RailData> {
  try {
    const r = await fetch(`/api/spy?rail=${rail}`, { cache: "no-store" });
    const j = await r.json();
    return { report: j.report ?? null, txs: j.txs ?? [] };
  } catch {
    return { report: null, txs: [] };
  }
}

export default function SpyPage() {
  const [left, setLeft] = useState<RailData>({ report: null, txs: [] });
  const [right, setRight] = useState<RailData>({ report: null, txs: [] });
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [explorerBase, setExplorerBase] = useState("https://testnet.arcscan.app");
  const [liveTick, setLiveTick] = useState<{ current: number; total: number } | null>(null);
  const [verify, setVerify] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [l, r] = await Promise.all([fetchRail("transparent"), fetchRail("unlink")]);
    setLeft(l); setRight(r);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function runLive() {
    const totalTicks = 3;
    setRunning(true);
    setEvents([]);
    setLiveTick({ current: 1, total: totalTicks });
    setStatus("Streaming the agent's real payments on Arc…");
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

  return (
    <main className="grain min-h-screen bg-bg">
      <Nav />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px]"
        style={{ background: "radial-gradient(50% 60% at 50% 0%, rgba(244,243,240,0.06) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto max-w-6xl px-6 pt-32 pb-24">
        <header className="rise max-w-2xl">
          <p className="eyebrow">what a competitor sees on-chain</p>
          <h1 className="text-gradient mt-4 text-[clamp(2rem,5vw,3.2rem)] font-semibold leading-[1.03]">
            Same agent. Two rails.
          </h1>
          <p className="mt-4 text-muted">
            A spy that reads Arc and tries to reconstruct the agent. Left: bare x402.
            Right: the same agent on Unlink.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button className="btn" disabled={running} onClick={runLive}>
              {running ? "Running live…" : "▶ Run agent live"}
            </button>
            <button className="btn-ghost" disabled={running} onClick={refresh}>Refresh from chain</button>
            {status && <span className="hint !mt-0">{status}</span>}
          </div>
        </header>

        <div className="mt-12">
          <AgentLog events={events} explorerBase={explorerBase} running={running} tick={liveTick} />
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <SpyPanel
            tone="exposed"
            rail="x402, transparent"
            subtitle="bare x402 nano-payments"
            report={left.report}
            txs={left.txs}
          />
          <SpyPanel
            tone="private"
            rail="Unlink, private"
            subtitle="same agent, shielded"
            report={right.report}
            txs={right.txs}
            onVerify={verifyPrivate}
            verifyText={verify}
          />
        </div>
      </div>
    </main>
  );
}

function SpyPanel({ tone, rail, subtitle, report, txs, onVerify, verifyText }: {
  tone: "exposed" | "private";
  rail: string;
  subtitle: string;
  report: SpyReport | null;
  txs: SpyTx[];
  onVerify?: () => void;
  verifyText?: string | null;
}) {
  const exposed = tone === "exposed";
  const readable = Boolean(report?.readable);
  const accent = exposed ? "var(--leak)" : "var(--faint)";

  return (
    <section
      className="overflow-hidden rounded-2xl border bg-[var(--bg-panel)]"
      style={{ borderColor: exposed && readable ? "var(--leak-soft)" : "var(--line)" }}
    >
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
        <div>
          <div className="font-mono text-sm text-ink">{rail}</div>
          <div className="font-mono text-[0.7rem] text-faint">{subtitle}</div>
        </div>
        <span
          className="font-mono text-[0.65rem] uppercase tracking-widest"
          style={{ color: accent }}
        >
          {readable ? "● exposed" : "○ unreadable"}
        </span>
      </div>

      <div className="p-5">
        <p className="eyebrow mb-4">reconstructed by a competitor</p>
        <Row label="Funder" value={readable ? short(report!.funder) : "∅ no link to owner"} hot={exposed && readable} />
        <Row
          label="Oracles queried"
          value={readable ? (report!.oracles.map((o) => `${o.label ?? short(o.oracle)} ×${o.calls}`).join("  ·  ") || "-") : "▓░▒▓ noise ▒░▓"}
          hot={exposed && readable}
        />
        <Row label="Budget spent" value={readable ? usd(report!.totalSpent) : "—"} hot={exposed && readable} />
        <Row label="Strategy" value={readable ? `"${report!.inferredStrategy}"` : "▓▒░ unreadable ░▒▓"} hot={exposed && readable} />

        {exposed && readable && txs.length > 0 && (
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <p className="eyebrow mb-3">on-chain proof · arcscan ↗</p>
            <ul className="space-y-0.5">
              {txs.slice(0, 8).map((t, i) => (
                <li key={`${t.hash}-${i}`}>
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded px-1.5 py-1 font-mono text-xs text-faint transition hover:bg-[var(--bg)] hover:text-ink"
                  >
                    <span className="uppercase tracking-wider">
                      {t.kind === "in" ? "funding" : t.label}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {short(t.hash)}
                      <span className="text-[0.7rem] opacity-70">↗</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!readable && (
          <p className="mt-5 font-mono text-xs text-faint">
            No agent→oracle edges on-chain. Just noise.
          </p>
        )}

        {onVerify && (
          <div className="mt-4 border-t border-[var(--line)] pt-4">
            <button className="btn-ghost !py-1.5 !text-xs" onClick={onVerify}>✓ verify on engine</button>
            {verifyText && <p className="mt-2 font-mono text-[0.7rem] text-faint">{verifyText}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

function Row({ label, value, hot }: { label: string; value: string; hot: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-2.5 last:border-0">
      <span className="font-mono text-[0.7rem] uppercase tracking-wider text-faint">{label}</span>
      <span
        className="text-right font-mono text-sm"
        style={{ color: hot ? "var(--leak)" : "var(--muted)" }}
      >
        {value}
      </span>
    </div>
  );
}
