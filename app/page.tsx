export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="text-sm uppercase tracking-widest text-violet-400">
        ETHGlobal New York 2026
      </p>
      <h1 className="mt-3 text-5xl font-bold tracking-tight">Shade</h1>
      <p className="mt-4 text-xl text-neutral-300">
        A private nano-payment agent. Its funding and its spending are
        unreadable on-chain — where bare x402 leaks an agent&apos;s strategy,
        budget and funder to anyone reading the chain.
      </p>

      <a
        href="/flow"
        className="mt-6 inline-block rounded-lg bg-violet-600 px-5 py-2.5 font-semibold text-white hover:bg-violet-500"
      >
        Launch the owner flow →
      </a>

      <div className="mt-10 grid gap-4 sm:grid-cols-3 text-sm">
        <Pill label="Dynamic" sub="wallet & onboarding" />
        <Pill label="Unlink" sub="private accounts" />
        <Pill label="Circle" sub="nano-payment settlement" />
      </div>

      <div className="mt-10 rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
        <h2 className="font-semibold text-neutral-100">x402 oracle endpoints</h2>
        <p className="mt-1 text-neutral-400 text-sm">
          Pay-per-call price feeds the agent queries (HTTP 402 → pay → 200):
        </p>
        <ul className="mt-3 space-y-1 font-mono text-sm text-violet-300">
          <li>GET /api/oracle/eth — ETH price</li>
          <li>GET /api/oracle/btc — BTC signal</li>
        </ul>
      </div>
    </main>
  );
}

function Pill({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
      <div className="font-semibold text-neutral-100">{label}</div>
      <div className="text-neutral-400">{sub}</div>
    </div>
  );
}
