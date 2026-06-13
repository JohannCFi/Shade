"use client";

import { useState } from "react";
import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";

/**
 * Minimal owner flow skeleton (étape 3, not polished):
 *   1. Connect (Dynamic)  2. Deploy agent  3. Fund agent  4. Run agent
 *
 * Connect is real (Dynamic). Deploy/Fund/Run are wired as skeletons with TODOs
 * — the real browser-Unlink + Circle calls land in étape 3 proper.
 */
export default function FlowPage() {
  const { primaryWallet, user } = useDynamicContext();
  const connected = Boolean(primaryWallet);

  const [deployed, setDeployed] = useState(false);
  const [amount, setAmount] = useState("5");
  const [funded, setFunded] = useState(false);
  const [running, setRunning] = useState(false);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold">Shade — owner flow</h1>
      <p className="mt-2 text-neutral-400">
        Connect, deploy your agent, fund it, run it. (skeleton)
      </p>

      <Step n={1} title="Connect" done={connected}>
        <DynamicWidget />
        {connected && (
          <p className="mt-2 text-sm text-neutral-400">
            Connected: <span className="font-mono">{primaryWallet?.address}</span>
            {user?.email ? ` (${user.email})` : ""}
          </p>
        )}
      </Step>

      <Step n={2} title="Deploy agent" done={deployed} disabled={!connected}>
        <button
          className="btn"
          disabled={!connected || deployed}
          onClick={() => setDeployed(true)} /* TODO: browser Unlink register */
        >
          {deployed ? "Agent deployed ✓" : "Deploy agent"}
        </button>
        <p className="hint">TODO: register the agent&apos;s Unlink (shielded) account.</p>
      </Step>

      <Step n={3} title="Fund agent" done={funded} disabled={!deployed}>
        <div className="flex items-center gap-2">
          <input
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
          <span className="text-neutral-400">USDC</span>
          <button className="btn" disabled={!deployed || funded} onClick={() => setFunded(true)}>
            {funded ? "Funded ✓" : "Fund (private)"}
          </button>
        </div>
        <p className="hint">TODO: deposit USDC into the Unlink pool → agent budget.</p>
      </Step>

      <Step n={4} title="Run agent" done={running} disabled={!funded}>
        <button className="btn" disabled={!funded} onClick={() => setRunning(true)}>
          {running ? "Agent running…" : "Run agent"}
        </button>
        <p className="hint">TODO: start the paid oracle loop (Circle + Unlink).</p>
      </Step>

      <style>{`
        .btn { background:#7c3aed; color:white; padding:8px 16px; border-radius:8px; font-weight:600; }
        .btn:disabled { opacity:.4; cursor:not-allowed; }
        .input { background:#171717; border:1px solid #333; border-radius:8px; padding:8px 12px; width:96px; color:white; }
        .hint { margin-top:8px; font-size:12px; color:#737373; }
      `}</style>
    </main>
  );
}

function Step({
  n,
  title,
  done,
  disabled,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`mt-6 rounded-lg border p-5 ${
        disabled ? "border-neutral-900 opacity-50" : "border-neutral-800"
      }`}
    >
      <h2 className="mb-3 font-semibold">
        <span className="mr-2 text-violet-400">{done ? "✓" : n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
