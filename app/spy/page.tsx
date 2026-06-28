"use client";

import { useEffect, useState } from "react";
import { Nav } from "../_components/Hero";
import { AgentLog } from "./_components/AgentLog";
import { parseNdjsonLines } from "@/src/spy/ndjson";
import type { RunEvent } from "@/src/spy/run-events";

interface OracleUsage { oracle: string; label?: string; calls: number; totalSpent: string }
interface VenueAllocation { venue: string; label?: string; amount: string }
interface SpyReport {
  readable: boolean;
  payer: string | null;
  funder: string | null;
  oracles: OracleUsage[];
  allocations: VenueAllocation[];
  totalSpent: string;
  inferredStrategy: string | null;
}
interface SpyTx { hash: string; url: string; kind: "out" | "in"; label: string; amount: string }
interface RailData { report: SpyReport | null; txs: SpyTx[] }

const usd = (atomic: string) => `${(Number(atomic) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`;
const short = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "-");

type PrivateDefiAction = { label: string; primitive: string; execAccount: string; status: string };
type PrivateResult = {
  payments: number;
  sellersReceived: { label: string; amount: string }[];
  withdrawals: { label: string; hash: string }[];
  defi?: { attempted: number; executed: number; actions: PrivateDefiAction[] };
  explorerBase: string;
};

async function fetchRail(rail: "transparent" | "unlink", address?: string | null): Promise<RailData> {
  try {
    const q = address ? `&address=${address}` : "";
    const r = await fetch(`/api/spy?rail=${rail}${q}`, { cache: "no-store" });
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
  const [verifyLinks, setVerifyLinks] = useState<{ label: string; url: string }[]>([]);
  const [agentAddr, setAgentAddr] = useState<string | null>(null);
  const [privateResult, setPrivateResult] = useState<PrivateResult | null>(null);
  const [ranOnce, setRanOnce] = useState(false);

  // On load only the (always-blind) right rail is read; the left starts empty and
  // fills only once a run produces its ephemeral agent.
  useEffect(() => { fetchRail("unlink").then(setRight); }, []);

  async function runLive() {
    const totalTicks = 3;
    setRunning(true);
    setEvents([]);
    setVerify(null);
    setVerifyLinks([]);
    setPrivateResult(null);
    setLeft({ report: null, txs: [] });
    setLiveTick({ current: 1, total: totalTicks });
    setStatus("Streaming the agent's real payments on Arc…");
    let runAgent: string | null = null;
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

      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const parsed = parseNdjsonLines(buffer, decoder.decode(value, { stream: true }));
          buffer = parsed.rest;
          for (const raw of parsed.lines) {
            const e = raw as RunEvent;
            if (e.kind === "start") {
              runAgent = e.agent;
              setAgentAddr(e.agent);
              setExplorerBase(e.explorerBase);
              continue;
            }
            if (e.kind === "error") throw new Error(e.message);
            if (e.kind === "private") {
              setPrivateResult({
                payments: e.payments,
                sellersReceived: e.sellersReceived,
                withdrawals: e.withdrawals,
                defi: e.defi,
                explorerBase: e.explorerBase,
              });
              continue;
            }
            setEvents((prev) => [...prev, e]);
            if (e.kind === "decide") setLiveTick({ current: Math.min(e.tick + 2, totalTicks), total: totalTicks });
            if (e.kind === "fund" || e.kind === "pay") {
              // Each new hash → let the spy panels re-read the chain (left scoped to this run's agent).
              fetchRail("transparent", runAgent).then(setLeft).catch(() => {});
              fetchRail("unlink").then(setRight).catch(() => {});
            }
          }
        }
      } finally {
        reader.cancel().catch(() => {});
      }

      setRight(await fetchRail("unlink"));
      if (runAgent) setLeft(await fetchRail("transparent", runAgent));
      setRanOnce(true);
      setStatus("Done — left reconstructed from the chain; right stayed dark.");
    } catch (e) {
      setStatus(`Failed: ${(e as Error).message}`);
    } finally {
      setRunning(false);
      setLiveTick(null);
    }
  }

  function verifyPrivate() {
    if (!ranOnce) {
      setVerify("Run the agent live first — then verify this run's private payments.");
      setVerifyLinks([]);
      return;
    }
    if (!privateResult) {
      setVerify("Private rail unavailable this run — check the Unlink pool/engine.");
      setVerifyLinks([]);
      return;
    }
    const sellers = privateResult.sellersReceived.map((s) => `${s.label} ${s.amount}`).join(" · ");
    const defi = privateResult.defi;
    const defiLine =
      defi && defi.executed > 0
        ? ` + ${defi.executed} private DeFi allocation${defi.executed > 1 ? "s" : ""} (${defi.actions
            .map((a) => a.label)
            .join(", ")}) via fresh ExecutionAccounts — no on-chain link.`
        : "";
    setVerify(
      `${privateResult.payments} private payments confirmed this run — invisible on the explorer.${sellers ? ` (${sellers})` : ""}${defiLine}`,
    );
    setVerifyLinks(
      privateResult.withdrawals.map((w) => ({
        label: `${w.label} cashed out → public`,
        url: `${privateResult.explorerBase}/tx/${w.hash}`,
      })),
    );
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
            verifyLinks={verifyLinks}
          />
        </div>
      </div>
    </main>
  );
}

function SpyPanel({ tone, rail, subtitle, report, txs, onVerify, verifyText, verifyLinks }: {
  tone: "exposed" | "private";
  rail: string;
  subtitle: string;
  report: SpyReport | null;
  txs: SpyTx[];
  onVerify?: () => void;
  verifyText?: string | null;
  verifyLinks?: { label: string; url: string }[];
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
        <Row
          label="Capital allocated"
          value={
            readable
              ? (report!.allocations.map((a) => `${a.label ?? short(a.venue)} ${usd(a.amount)}`).join("  ·  ") || "—")
              : "▓▒░ unreadable ░▒▓"
          }
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
            {verifyLinks && verifyLinks.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {verifyLinks.map((l, i) => (
                  <li key={`${l.url}-${i}`}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-3 rounded px-1.5 py-1 font-mono text-[0.7rem] text-[#7da7c7] transition hover:bg-[var(--bg)] hover:underline"
                    >
                      <span className="uppercase tracking-wider">{l.label}</span>
                      <span className="opacity-80">arcscan ↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
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
