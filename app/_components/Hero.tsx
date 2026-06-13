"use client";

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--line)] bg-[rgba(8,8,10,0.72)] backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <a href="/" className="flex items-center gap-2.5">
          <KeyMark />
          <span className="text-[0.95rem] font-semibold tracking-tight">Shade</span>
        </a>
        <div className="hidden items-center gap-8 text-sm text-muted md:flex">
          <a href="#how" className="transition hover:text-ink">How it works</a>
          <a href="#chain" className="transition hover:text-ink">The problem</a>
          <a href="#rails" className="transition hover:text-ink">Rails</a>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/flow"
            className="rounded-lg bg-ink px-3.5 py-1.5 text-sm font-medium text-bg transition hover:opacity-90"
          >
            Launch app
          </a>
        </div>
      </nav>
    </header>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-40 pb-24 text-center sm:pt-48">
      {/* faint top-lit glow, Linear-style */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px]"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, rgba(244,243,240,0.10) 0%, transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-3xl">
        <h1 className="rise text-gradient text-[clamp(2.6rem,6.5vw,5rem)] font-semibold leading-[0.98]">
          Make your strategy
          <br />
          unreadable
        </h1>

        <p
          className="rise mx-auto mt-6 max-w-xl font-mono text-[0.95rem] text-muted"
          style={{ animationDelay: "0.1s" }}
        >
          Same orders, same settlement —{" "}
          <span className="text-ink">zero footprint.</span>
        </p>

        <div
          className="rise mt-9 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "0.2s" }}
        >
          <a
            href="/flow"
            className="group inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-bg transition hover:opacity-90"
          >
            Connect &amp; Become Invisible
            <span className="transition group-hover:translate-x-0.5">→</span>
          </a>
          <a
            href="#how"
            className="rounded-lg border border-[var(--line-2)] px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-[var(--bg-panel)]"
          >
            See how it works
          </a>
        </div>
      </div>

      {/* teaser: the public chain, fully readable — the problem, set up */}
      <ExposedLedger />
    </section>
  );
}

function ExposedLedger() {
  const rows = [
    ["0x9f3a…c21b", "→ oracle/eth", "pay 0.002 USDC"],
    ["0x9f3a…c21b", "→ oracle/btc", "pay 0.002 USDC"],
    ["0xab7e…0f44", "funded agent", "+ 5.000 USDC"],
    ["0x9f3a…c21b", "→ oracle/eth", "pay 0.002 USDC"],
  ];
  return (
    <div className="rise relative mx-auto mt-20 max-w-3xl" style={{ animationDelay: "0.3s" }}>
      <div className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] text-left shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5 font-mono text-xs">
          <span className="text-faint caret">arc-testnet · public mempool</span>
          <span className="flex items-center gap-1.5 text-leak">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-leak" style={{ animation: "pulse-dot 2s infinite" }} />
            EXPOSED
          </span>
        </div>
        <table className="w-full font-mono text-xs">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-2.5 text-muted">{r[0]}</td>
                <td className="px-4 py-2.5 text-faint">{r[1]}</td>
                <td className="px-4 py-2.5 text-right text-ink">{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-center font-mono text-xs text-faint">
        every line above is public. strategy, budget and funder — reconstructable by anyone.
      </p>
    </div>
  );
}

function KeyMark() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-md bg-ink">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="8" cy="12" r="5.4" stroke="#08080a" strokeWidth="3.2" />
        <path d="M12.6 12H21v3.2M16.6 12v3.2" stroke="#08080a" strokeWidth="3.2" strokeLinecap="square" />
      </svg>
    </span>
  );
}
