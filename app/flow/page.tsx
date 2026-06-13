"use client";

import { useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import type { UnlinkClient } from "@unlink-xyz/sdk/browser";
import {
  createBrowserUnlinkClient,
  BROWSER_TOKEN,
  fmtToken,
  toToken,
} from "@/src/unlink/browser-client";
import { ethPriceAt, btcSignalAt } from "@/src/oracle/feed";
import { decide, describeStrategy, type BtcSignal } from "@/src/agent/strategy";
import { Nav } from "../_components/Hero";

const PRICE = toToken("0.001"); // per oracle call

/**
 * Real owner flow (private rail): Connect (Dynamic) → Deploy (register Unlink) →
 * Fund (deposit USDC into the pool) → Run (agent pays oracles privately).
 */
export default function FlowPage() {
  const { primaryWallet, setShowAuthFlow, handleLogOut } = useDynamicContext();
  const connected = Boolean(primaryWallet);

  const [client, setClient] = useState<UnlinkClient | null>(null);
  const [unlinkAddr, setUnlinkAddr] = useState("");
  const [budget, setBudget] = useState("0");
  const [amount, setAmount] = useState("5");
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const say = (m: string) => setLog((l) => [...l, m]);

  async function refreshBudget(c: UnlinkClient): Promise<string> {
    const { balances } = await c.getBalances({ token: BROWSER_TOKEN });
    const b = balances.find((x) => x.token.toLowerCase() === BROWSER_TOKEN.toLowerCase());
    const v = b ? fmtToken(b.amount) : "0";
    setBudget(v);
    return v;
  }

  async function onDeploy() {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      say("Connect an EVM wallet first."); return;
    }
    setBusy("deploy");
    try {
      const c = await createBrowserUnlinkClient(primaryWallet);
      await c.ensureRegistered();
      const addr = await c.getAddress();
      setClient(c); setUnlinkAddr(addr);
      say(`Agent deployed, Unlink account ${addr.slice(0, 14)}…`);
      await refreshBudget(c);
    } catch (e) { say(`Deploy failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function onFund() {
    if (!client) return;
    setBusy("fund");
    try {
      say(`Funding ${amount} USDC into the pool (private)…`);
      const tx = await client.depositWithApproval({ token: BROWSER_TOKEN, amount: toToken(amount) });
      await tx.wait();
      const newBudget = await refreshBudget(client);
      say(`Funded ✓, budget now ${newBudget} USDC`);
    } catch (e) { say(`Fund failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function onRun() {
    if (!client) return;
    setBusy("run");
    try {
      const sellers = await (await fetch("/api/oracle/sellers")).json();
      if (sellers.error) throw new Error(sellers.error);
      let prevEth = 0;
      for (let tick = 0; tick < 3; tick++) {
        await (await client.transfer({ token: BROWSER_TOKEN, amount: PRICE, recipientAddress: sellers.eth })).wait();
        await (await client.transfer({ token: BROWSER_TOKEN, amount: PRICE, recipientAddress: sellers.btc })).wait();
        const ethPrice = ethPriceAt(tick);
        const btcSignal = btcSignalAt(tick) as BtcSignal;
        const action = decide({ ethPrice, ethPrevPrice: tick === 0 ? ethPrice : prevEth, btcSignal });
        prevEth = ethPrice;
        say(`t${tick}: paid 2 oracles privately · ETH=${ethPrice} BTC=${btcSignal} → ${action}`);
      }
      await refreshBudget(client);
      say("Run complete, payments left no on-chain agent→oracle trail.");
    } catch (e) { say(`Run failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  return (
    <main className="grain min-h-screen bg-bg">
      <Nav />

      {/* faint top glow, like the landing */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px]"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, rgba(244,243,240,0.07) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-2xl px-6 pt-36 pb-28">
        <header className="rise">
          <p className="eyebrow">owner flow</p>
          <h1 className="text-gradient mt-4 text-[clamp(2.2rem,5vw,3.4rem)] font-semibold leading-[1.02]">
            Become invisible
          </h1>
          <p className="mt-4 font-mono text-sm text-muted">{describeStrategy()}</p>
        </header>

        <div className="mt-12 space-y-3">
          <Step n={1} title="Connect" done={connected}>
            {connected ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm text-ink">
                  {primaryWallet?.address?.slice(0, 6)}…{primaryWallet?.address?.slice(-4)}
                </span>
                <button className="btn-ghost" onClick={() => handleLogOut()}>
                  Disconnect
                </button>
              </div>
            ) : (
              <button className="btn" onClick={() => setShowAuthFlow(true)}>
                Log in or sign up
              </button>
            )}
          </Step>

          <Step n={2} title="Deploy agent" done={Boolean(client)} disabled={!connected}>
            <button className="btn" disabled={!connected || busy !== null || Boolean(client)} onClick={onDeploy}>
              {busy === "deploy" ? "Deploying…" : client ? "Deployed ✓" : "Deploy agent"}
            </button>
            {unlinkAddr && (
              <p className="hint">
                Unlink account: <span className="text-ink">{unlinkAddr.slice(0, 24)}…</span>
              </p>
            )}
          </Step>

          <Step n={3} title="Fund agent, private" done={Number(budget) > 0} disabled={!client}>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                className="input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
              <span className="font-mono text-sm text-muted">USDC</span>
              <button className="btn" disabled={!client || busy !== null} onClick={onFund}>
                {busy === "fund" ? "Funding…" : "Fund"}
              </button>
            </div>
            <p className="hint">
              Budget: <span className="text-ink">{budget} USDC</span>
            </p>
          </Step>

          <Step n={4} title="Run agent" done={false} disabled={Number(budget) <= 0}>
            <button className="btn" disabled={!client || busy !== null || Number(budget) <= 0} onClick={onRun}>
              {busy === "run" ? "Running…" : "Run agent"}
            </button>
            <p className="hint">Pays two oracles privately each tick, no agent→oracle trail.</p>
          </Step>
        </div>

        {log.length > 0 && (
          <div className="mt-8 overflow-hidden rounded-xl border border-[var(--line-2)] bg-[var(--bg-panel)] font-mono text-xs shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5 text-muted">
              <span className="caret">shade://agent · log</span>
              <span className="flex items-center gap-1.5 text-[0.65rem] uppercase tracking-widest">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-glow" style={{ animation: "pulse-dot 2s infinite" }} />
                arc-testnet
              </span>
            </div>
            <pre className="whitespace-pre-wrap p-4 leading-relaxed text-faint">{log.join("\n")}</pre>
          </div>
        )}

        <p className="mt-10 text-center font-mono text-[0.7rem] text-faint">
          Same orders, same settlement, zero footprint.
        </p>
      </div>

      <style>{`
        .btn {
          display:inline-flex; align-items:center; gap:8px;
          background: var(--ink); color: var(--bg);
          padding: 10px 20px; border-radius: 10px;
          font-family: var(--font-body); font-size: 0.975rem; font-weight: 500;
          transition: opacity .15s ease;
        }
        .btn:hover:not(:disabled) { opacity: .9; }
        .btn:disabled { opacity:.35; cursor:not-allowed; }
        .btn-ghost {
          display:inline-flex; align-items:center; gap:8px;
          background: transparent; color: var(--ink);
          padding: 10px 18px; border-radius: 10px;
          border: 1px solid var(--line-2);
          font-family: var(--font-body); font-size: 0.975rem; font-weight: 500;
          transition: background .15s ease;
        }
        .btn-ghost:hover { background: var(--bg-panel); }
        .input {
          background: var(--bg); border:1px solid var(--line-2);
          border-radius:10px; padding:10px 12px; width:104px;
          color: var(--ink); font-family: var(--font-mono); font-size:.95rem;
        }
        .input:focus { outline:none; border-color: var(--faint); }
        .hint { margin-top:12px; font-family: var(--font-mono); font-size:12px; color: var(--faint); }
      `}</style>
    </main>
  );
}

function Step({ n, title, done, disabled, children }: {
  n: number; title: string; done?: boolean; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border p-5 transition-opacity ${
        disabled ? "border-[var(--line)] opacity-45" : "border-[var(--line-2)] bg-[var(--bg-panel)]"
      }`}
    >
      <div className="mb-4 flex items-center gap-3">
        <span
          className={`grid h-6 w-6 place-items-center rounded-md text-xs font-semibold ${
            done ? "bg-ink text-bg" : "border border-[var(--line-2)] font-mono text-muted"
          }`}
        >
          {done ? "✓" : n}
        </span>
        <h2 className="font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}
