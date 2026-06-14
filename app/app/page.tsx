"use client";

import { useState } from "react";
import { erc20Abi } from "viem";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import type { UnlinkClient } from "@unlink-xyz/sdk/browser";
import {
  createBrowserUnlinkClient,
  BROWSER_TOKEN,
  BROWSER_TOKEN_DECIMALS,
  fmtToken,
  toToken,
} from "@/src/unlink/browser-client";
import { computeDefaultFundAmount, botConnectSnippet } from "@/src/dashboard/helpers";

const GAS_RESERVE = (5n * 10n ** BigInt(Math.max(BROWSER_TOKEN_DECIMALS - 1, 0))).toString(); // 0.5

interface Tx { type?: string; status?: string }

export default function AppDashboard() {
  const { primaryWallet, setShowAuthFlow, handleLogOut } = useDynamicContext();
  const connected = Boolean(primaryWallet);

  const [client, setClient] = useState<UnlinkClient | null>(null);
  const [unlinkAddr, setUnlinkAddr] = useState("");
  const [evmAddr, setEvmAddr] = useState("");
  const [budget, setBudget] = useState("0");
  const [fundAmount, setFundAmount] = useState("");
  const [activity, setActivity] = useState<Tx[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function refreshBudget(c: UnlinkClient): Promise<string> {
    const { balances } = await c.getBalances({ token: BROWSER_TOKEN });
    const b = balances.find((x) => x.token.toLowerCase() === BROWSER_TOKEN.toLowerCase());
    const v = b ? fmtToken(b.amount) : "0";
    setBudget(v);
    return v;
  }

  async function refreshActivity(c: UnlinkClient) {
    try {
      const { transactions } = await c.getTransactions({ type: "transfer", limit: 8 });
      setActivity(transactions as Tx[]);
    } catch { /* ignore */ }
  }

  async function onDeploy() {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) { setMsg("Connect an EVM wallet first."); return; }
    setBusy("deploy"); setMsg("Sign the message to derive your bot identity…");
    try {
      const c = await createBrowserUnlinkClient(primaryWallet);
      await c.ensureRegistered();
      setClient(c);
      setUnlinkAddr(await c.getAddress());
      const wc = await primaryWallet.getWalletClient();
      const addr = wc.account.address;
      setEvmAddr(addr);
      await refreshBudget(c);
      await refreshActivity(c);
      // default fund = ~whole wallet minus gas reserve
      try {
        const pub = await primaryWallet.getPublicClient();
        const bal = await pub.readContract({ address: BROWSER_TOKEN as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [addr as `0x${string}`] });
        setFundAmount(fmtToken(computeDefaultFundAmount(bal.toString(), GAS_RESERVE)));
      } catch { setFundAmount(""); }
      setMsg("Bot deployed. Fund its private budget to start.");
    } catch (e) { setMsg(`Deploy failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function onFund() {
    if (!client || !fundAmount) return;
    setBusy("fund"); setMsg(`Moving ${fundAmount} USDC into your private budget…`);
    try {
      await (await client.depositWithApproval({ token: BROWSER_TOKEN, amount: toToken(fundAmount) })).wait();
      const nb = await refreshBudget(client);
      await refreshActivity(client);
      setMsg(`Funded. Private budget: ${nb} USDC.`);
    } catch (e) { setMsg(`Fund failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function onUnplug() {
    if (!client || Number(budget) <= 0) return;
    setBusy("unplug"); setMsg("Unplugging — withdrawing your full private budget…");
    try {
      await (await client.withdraw({ token: BROWSER_TOKEN, amount: toToken(budget), recipientEvmAddress: evmAddr })).wait();
      await refreshBudget(client);
      await refreshActivity(client);
      setMsg("Bot unplugged. Budget withdrawn to your wallet — it can no longer pay.");
    } catch (e) { setMsg(`Unplug failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  return (
    <main className="grain min-h-screen bg-bg">
      {/* minimal app shell: logo only */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--line)] bg-[rgba(8,8,10,0.72)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <a href="/" className="text-[0.95rem] font-semibold tracking-tight text-ink">Shade</a>
          {connected && (
            <button className="btn-ghost" onClick={() => handleLogOut()}>Disconnect wallet</button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 pt-32 pb-24">
        <p className="eyebrow">your bot</p>
        <h1 className="text-gradient mt-3 text-[clamp(1.9rem,4vw,2.8rem)] font-semibold leading-[1.05]">
          Plug your bot into Shade
        </h1>
        <p className="mt-3 text-muted">
          Connect a dedicated wallet, deploy its private identity, fund a budget, then run
          your bot as usual, its data payments stay invisible on-chain. Monitor it here.
        </p>

        {msg && <p className="mt-4 font-mono text-xs text-faint">{msg}</p>}

        {/* STATE 1: disconnected */}
        {!connected && (
          <Card title="1 · Connect your wallet">
            <p className="hint !mt-0 mb-3">Your dedicated wallet = your bot (1 wallet, 1 bot).</p>
            <button className="btn" onClick={() => setShowAuthFlow(true)}>Connect wallet</button>
          </Card>
        )}

        {/* STATE 2: connected, not deployed */}
        {connected && !client && (
          <Card title="2 · Deploy your bot">
            <p className="hint !mt-0 mb-3">
              You sign a message; Shade derives your bot&apos;s private Unlink identity from it.
              Deterministic, so this wallet always maps to the same single bot.
            </p>
            <button className="btn" disabled={busy !== null} onClick={onDeploy}>
              {busy === "deploy" ? "Deploying…" : "Deploy my bot"}
            </button>
          </Card>
        )}

        {/* STATE 3: cockpit */}
        {client && (
          <div className="mt-6 space-y-4">
            <Card title="Bot identity">
              <KV k="Wallet" v={short(evmAddr)} />
              <KV k="Bot" v={`${unlinkAddr.slice(0, 22)}…`} />
              <KV k="Guarantee" v="1 bot per wallet · deterministic · deployed ✓" />
              <p className="hint">Recognized by deriving it from your wallet signature, the same wallet always controls this exact bot.</p>
            </Card>

            <Card title="Private budget">
              <KV k="Balance" v={`${budget} USDC`} />
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <input className="input" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} inputMode="decimal" placeholder="amount" />
                <span className="font-mono text-sm text-muted">USDC</span>
                <button className="btn" disabled={busy !== null || !fundAmount} onClick={onFund}>
                  {busy === "fund" ? "Funding…" : "Fund private budget"}
                </button>
                <button className="btn-ghost" disabled={busy !== null || Number(budget) <= 0} onClick={onUnplug}>
                  {busy === "unplug" ? "Unplugging…" : "Unplug bot"}
                </button>
              </div>
              <p className="hint">Default is ~your whole wallet (a gas reserve is kept). Unplug withdraws it all back, the bot can no longer pay.</p>
            </Card>

            <Card title="Connect your external bot">
              <p className="hint !mt-0 mb-3">Use this wallet in your own bot, same identity, same private budget.</p>
              <pre className="overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--bg-panel)] p-4 font-mono text-[0.72rem] leading-relaxed text-muted">
{botConnectSnippet({ environment: "arc-testnet", token: BROWSER_TOKEN })}
              </pre>
            </Card>

            <Card title="Activity (private, only you see it)">
              {activity.length === 0 ? (
                <p className="hint !mt-0">No private payments yet.</p>
              ) : (
                <ul className="space-y-1.5 font-mono text-xs text-muted">
                  {activity.map((t, i) => (
                    <li key={i} className="flex justify-between border-b border-[var(--line)] py-1.5 last:border-0">
                      <span>{t.type ?? "transfer"}</span>
                      <span className="text-faint">{t.status ?? ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}

const short = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-5">
      <h2 className="mb-3 font-mono text-sm text-ink">{title}</h2>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-2 last:border-0">
      <span className="font-mono text-[0.7rem] uppercase tracking-wider text-faint">{k}</span>
      <span className="text-right font-mono text-sm text-muted">{v}</span>
    </div>
  );
}
