"use client";

import { useState } from "react";
import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
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

const PRICE = toToken("0.001"); // per oracle call

/**
 * Real owner flow (private rail): Connect (Dynamic) → Deploy (register Unlink) →
 * Fund (deposit USDC into the pool) → Run (agent pays oracles privately).
 * Styling is intentionally minimal — polish comes later.
 */
export default function FlowPage() {
  const { primaryWallet } = useDynamicContext();
  const connected = Boolean(primaryWallet);

  const [client, setClient] = useState<UnlinkClient | null>(null);
  const [unlinkAddr, setUnlinkAddr] = useState("");
  const [budget, setBudget] = useState("0");
  const [amount, setAmount] = useState("5");
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const say = (m: string) => setLog((l) => [...l, m]);

  async function refreshBudget(c: UnlinkClient) {
    const { balances } = await c.getBalances({ token: BROWSER_TOKEN });
    const b = balances.find((x) => x.token.toLowerCase() === BROWSER_TOKEN.toLowerCase());
    setBudget(b ? fmtToken(b.amount) : "0");
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
      say(`Agent deployed — Unlink account ${addr.slice(0, 14)}…`);
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
      await refreshBudget(client);
      say(`Funded ✓ — budget now ${budget} USDC`);
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
      say("Run complete — payments left no on-chain agent→oracle trail.");
    } catch (e) { say(`Run failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold">Shade — owner flow</h1>
      <p className="mt-2 text-neutral-400">{describeStrategy()}</p>

      <Step n={1} title="Connect" done={connected}>
        <DynamicWidget />
      </Step>

      <Step n={2} title="Deploy agent" done={Boolean(client)} disabled={!connected}>
        <button className="btn" disabled={!connected || busy !== null || Boolean(client)} onClick={onDeploy}>
          {busy === "deploy" ? "Deploying…" : client ? "Deployed ✓" : "Deploy agent"}
        </button>
        {unlinkAddr && <p className="hint">Unlink account: <span className="font-mono">{unlinkAddr.slice(0, 24)}…</span></p>}
      </Step>

      <Step n={3} title="Fund agent (private)" done={Number(budget) > 0} disabled={!client}>
        <div className="flex items-center gap-2">
          <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          <span className="text-neutral-400">USDC</span>
          <button className="btn" disabled={!client || busy !== null} onClick={onFund}>
            {busy === "fund" ? "Funding…" : "Fund"}
          </button>
        </div>
        <p className="hint">Budget: {budget} USDC</p>
      </Step>

      <Step n={4} title="Run agent" disabled={Number(budget) <= 0}>
        <button className="btn" disabled={!client || busy !== null || Number(budget) <= 0} onClick={onRun}>
          {busy === "run" ? "Running…" : "Run agent"}
        </button>
      </Step>

      {log.length > 0 && (
        <pre className="mt-6 whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-xs text-neutral-300">
          {log.join("\n")}
        </pre>
      )}

      <style>{`
        .btn { background:#7c3aed; color:white; padding:8px 16px; border-radius:8px; font-weight:600; }
        .btn:disabled { opacity:.4; cursor:not-allowed; }
        .input { background:#171717; border:1px solid #333; border-radius:8px; padding:8px 12px; width:96px; color:white; }
        .hint { margin-top:8px; font-size:12px; color:#737373; }
      `}</style>
    </main>
  );
}

function Step({ n, title, done, disabled, children }: {
  n: number; title: string; done?: boolean; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <section className={`mt-6 rounded-lg border p-5 ${disabled ? "border-neutral-900 opacity-50" : "border-neutral-800"}`}>
      <h2 className="mb-3 font-semibold"><span className="mr-2 text-violet-400">{done ? "✓" : n}</span>{title}</h2>
      {children}
    </section>
  );
}
