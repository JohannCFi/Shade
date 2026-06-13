"use client";

import { useEffect, useRef } from "react";

/**
 * The scroll story below the hero: how Shade works, the bare-x402 trap,
 * the invisible rail, the stack, and the final call to action.
 */
export function Sections() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = root.current?.querySelectorAll(".reveal");
    if (!els) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) e.target.classList.add("in-view");
        }
      },
      { threshold: 0.2 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={root} className="relative">
      <div className="mx-auto max-w-6xl px-6">
        <div className="hairline" />
      </div>

      {/* intro — the problem */}
      <section id="chain" className="mx-auto max-w-3xl scroll-mt-24 px-6 pt-28 pb-10 text-center">
        <p className="eyebrow reveal mb-6">the problem</p>
        <h2 className="text-gradient reveal reveal-delay-1 text-[clamp(2rem,5vw,3.4rem)] font-semibold leading-[1.04]">
          Here is what the chain <span className="italic">never</span> gets to
          see
        </h2>
        <p className="reveal reveal-delay-2 mx-auto mt-5 max-w-xl text-muted">
          Scroll. Watch an autonomous agent earn its invisibility, one
          nano-payment at a time.
        </p>
      </section>

      {/* how it works */}
      <div id="how" className="scroll-mt-24">
        <Step index="01" title="The agent lives" tone="neutral" visual={<LoopDiagram />}>
          Shade runs a loop: query a price oracle, get hit with{" "}
          <code className="text-ink">HTTP 402</code>, pay a fraction of a cent,
          read the answer, decide. Thousands of times a day.
        </Step>

        <Step index="02" title="Bare x402 is a confession" tone="leak" visual={<SpyPanel exposed />}>
          Every transparent payment is a footprint. A competitor reading the
          chain rebuilds your <em>strategy</em>, your <em>budget</em>, and the
          wallet that <em>funds</em> you, for free.
        </Step>

        <Step index="03" title="Shade casts no shadow" tone="glow" visual={<SpyPanel exposed={false} />}>
          Same agent, routed through Unlink private accounts. The funding and the
          spending settle for real, but the spy panel sees only noise.
        </Step>
      </div>

      {/* impact statement */}
      <section className="relative overflow-hidden border-t border-[var(--line)] px-6 pt-32 pb-14 text-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(45% 70% at 50% 50%, var(--glow-soft) 0%, transparent 70%)",
          }}
        />
        <h2 className="text-gradient reveal relative mx-auto max-w-4xl text-[clamp(2.4rem,6.5vw,5rem)] font-semibold leading-[0.98]">
          Be invisible
          <br />
          on-chain
        </h2>
        <p className="reveal reveal-delay-1 relative mx-auto mt-7 max-w-xl text-[1.05rem] leading-relaxed text-muted">
          Shade is an autonomous agent whose funding and spending are unreadable
          on-chain, where bare x402 leaks your strategy, your budget, and your
          backer to anyone watching the chain.
        </p>
      </section>

      {/* the three rails */}
      <section id="rails" className="mx-auto max-w-6xl scroll-mt-24 px-6 pt-4 pb-28">
        <p className="eyebrow reveal mb-10 text-center">built on three rails</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Rail name="Dynamic" sub="wallet & onboarding" line="the owner connects" />
          <Rail name="Unlink" sub="private accounts" line="the agent disappears" />
          <Rail name="Circle" sub="nano-payment settlement" line="cents move for real" />
        </div>
      </section>

      {/* final CTA — sits just under the divider, page ends here */}
      <section className="relative flex flex-col items-center border-t border-[var(--line)] px-6 pt-24 pb-28 text-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(50% 70% at 50% 30%, var(--glow-soft) 0%, transparent 70%)",
          }}
        />
        <h2 className="text-gradient reveal relative text-[clamp(2.4rem,7vw,4.5rem)] font-semibold leading-[1.1]">
          Step out of the light
        </h2>
        <div className="reveal reveal-delay-1 relative mt-10 flex justify-center">
          <a
            href="/flow"
            className="group inline-flex items-center gap-2 rounded-lg bg-ink px-6 py-3 text-sm font-medium text-bg transition hover:opacity-90"
          >
            Connect &amp; Become Invisible
            <span className="transition group-hover:translate-x-0.5">→</span>
          </a>
        </div>
        <p className="reveal reveal-delay-2 relative mt-10 font-mono text-[0.7rem] text-faint">
          ETHGlobal New York 2026 · Dynamic + Unlink + Circle · Arc Testnet
        </p>
      </section>
    </div>
  );
}

function Step({
  index,
  title,
  tone,
  visual,
  children,
}: {
  index: string;
  title: string;
  tone: "neutral" | "leak" | "glow";
  visual: React.ReactNode;
  children: React.ReactNode;
}) {
  const accent =
    tone === "leak" ? "var(--leak)" : "var(--muted)";
  return (
    <section className="border-t border-[var(--line)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-24 md:grid-cols-[0.9fr_1.1fr] md:items-center">
        <div className="reveal">
          <span className="font-mono text-[0.7rem]" style={{ color: accent }}>
            {index} /
          </span>
          <h3 className="text-gradient mt-3 text-[clamp(1.7rem,4vw,2.6rem)] font-semibold leading-[1.05]">
            {title}
          </h3>
          <p className="mt-5 max-w-lg text-muted">{children}</p>
        </div>
        <div className="reveal reveal-delay-1">{visual}</div>
      </div>
    </section>
  );
}

function LoopDiagram() {
  const nodes = ["query", "402", "pay", "200"];
  return (
    <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
      {nodes.map((n, i) => (
        <span key={n} className="flex items-center gap-3">
          <span
            className="rounded-md border border-[var(--line-2)] bg-[var(--bg-panel)] px-3 py-1.5 text-ink"
            style={{ animation: `pulse-dot 2.4s ${i * 0.3}s infinite` }}
          >
            {n}
          </span>
          {i < nodes.length - 1 && <span className="text-faint">→</span>}
        </span>
      ))}
      <span className="ml-1 text-faint">↺</span>
    </div>
  );
}

function SpyPanel({ exposed }: { exposed: boolean }) {
  const rows = exposed
    ? [
        ["strategy", "momentum · eth>btc · 12s cadence"],
        ["budget", "1.842 USDC remaining"],
        ["funder", "0xab7e…0f44 (owner wallet)"],
        ["calls/day", "≈ 6,400 reconstructed"],
      ]
    : [
        ["strategy", "▓▒░ unreadable ░▒▓"],
        ["budget", "-"],
        ["funder", "∅ no link to owner"],
        ["calls/day", "▓░▒▓ noise ▒░▓"],
      ];
  return (
    <div
      className="overflow-hidden rounded-xl border bg-[var(--bg-panel)] font-mono text-xs shadow-2xl shadow-black/40"
      style={{ borderColor: exposed ? "var(--leak-soft)" : "var(--line-2)" }}
    >
      <div
        className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5"
        style={{ color: exposed ? "var(--leak)" : "var(--muted)" }}
      >
        <span className="caret">spy://reconstruct</span>
        <span className="flex items-center gap-1.5 text-[0.65rem] uppercase tracking-widest">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: exposed ? "var(--leak)" : "var(--muted)" }}
          />
          {exposed ? "exposed" : "invisible"}
        </span>
      </div>
      <table className="w-full">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={i} className="border-b border-[var(--line)] last:border-0">
              <td className="w-1/3 px-4 py-2.5 text-faint">{k}</td>
              <td
                className="px-4 py-2.5"
                style={{ color: exposed ? "var(--ink)" : "var(--faint)" }}
              >
                {v}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rail({ name, sub, line }: { name: string; sub: string; line: string }) {
  return (
    <div className="reveal group rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-6 transition hover:border-[var(--line-2)]">
      <div className="text-2xl font-semibold tracking-tight">{name}</div>
      <div className="mt-1 font-mono text-[0.7rem] uppercase tracking-widest text-muted">
        {sub}
      </div>
      <div className="mt-6 border-t border-[var(--line)] pt-4 text-sm text-faint transition group-hover:text-ink">
        {line}
      </div>
    </div>
  );
}
