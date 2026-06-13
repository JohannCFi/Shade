"use client";

import { useCallback, useEffect, useState } from "react";
import { Nav } from "../_components/Hero";

interface OracleUsage { oracle: string; label?: string; calls: number; totalSpent: string }
interface SpyReport {
  readable: boolean;
  payer: string | null;
  funder: string | null;
  oracles: OracleUsage[];
  totalSpent: string;
  inferredStrategy: string | null;
}

const usd = (atomic: string) => `${(Number(atomic) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`;
const short = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "-");

async function fetchRail(rail: "transparent" | "unlink"): Promise<SpyReport | null> {
  try {
    const r = await fetch(`/api/spy?rail=${rail}`, { cache: "no-store" });
    const j = await r.json();
    return j.report ?? null;
  } catch {
    return null;
  }
}

export default function SpyPage() {
  const [left, setLeft] = useState<SpyReport | null>(null);
  const [right, setRight] = useState<SpyReport | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string>("");

  const refresh = useCallback(async () => {
    const [l, r] = await Promise.all([fetchRail("transparent"), fetchRail("unlink")]);
    setLeft(l); setRight(r);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function runLive() {
    setRunning(true);
    setStatus("Sending real payments on Arc…");
    try {
      const res = await fetch("/api/spy/run-transparent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticks: 3 }),
      }).then((r) => r.json());
      if (!res.ok) throw new Error(res.error ?? "run failed");
      setStatus("Reading the chain…");
      // poll the LEFT a few times as logs get indexed
      for (let i = 0; i < 8; i++) {
        const l = await fetchRail("transparent");
        setLeft(l);
        if (l?.readable && l.oracles.length >= 2) break;
        await new Promise((r) => setTimeout(r, 4000));
      }
      await refresh();
      setStatus("Done, the left was reconstructed from the chain; the right stayed dark.");
    } catch (e) {
      setStatus(`Failed: ${(e as Error).message}`);
    } finally {
      setRunning(false);
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

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <SpyPanel
            tone="exposed"
            rail="x402, transparent"
            subtitle="bare x402 nano-payments"
            report={left}
          />
          <SpyPanel
            tone="private"
            rail="Unlink, private"
            subtitle="same agent, shielded"
            report={right}
          />
        </div>
      </div>
    </main>
  );
}

function SpyPanel({ tone, rail, subtitle, report }: {
  tone: "exposed" | "private";
  rail: string;
  subtitle: string;
  report: SpyReport | null;
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
        <p className="eyebrow mb-4">🕵️ reconstructed by a competitor</p>
        <Row label="Funder" value={readable ? short(report!.funder) : "🚫"} hot={exposed && readable} />
        <Row
          label="Oracles queried"
          value={readable ? (report!.oracles.map((o) => `${o.label ?? short(o.oracle)} ×${o.calls}`).join("  ·  ") || "-") : "🚫"}
          hot={exposed && readable}
        />
        <Row label="Budget spent" value={readable ? usd(report!.totalSpent) : "🚫"} hot={exposed && readable} />
        <Row label="Strategy" value={readable ? `"${report!.inferredStrategy}"` : "🚫 unreadable"} hot={exposed && readable} />

        {!readable && (
          <p className="mt-5 font-mono text-xs text-faint">
            No agent→oracle edges on-chain. Just noise.
          </p>
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
