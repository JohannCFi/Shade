import { NextResponse } from "next/server";
import { arcTestnet } from "viem/chains";
import { readObservablePayments } from "@/src/spy/chain-reader";
import { reconstruct } from "@/src/spy/reconstruct";
import { deriveSpyAddresses, oracleLabels } from "@/src/spy/agents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN = process.env.UNLINK_TEST_TOKEN ?? "0x3600000000000000000000000000000000000000";

/**
 * What a competitor reconstructs from the real chain for one rail.
 * GET /api/spy?rail=transparent|unlink
 */
export async function GET(request: Request): Promise<NextResponse> {
  const mnemonic = process.env.WALLET_MNEMONIC;
  if (!mnemonic) return NextResponse.json({ error: "server not configured" }, { status: 500 });

  const rail = new URL(request.url).searchParams.get("rail") === "unlink" ? "unlink" : "transparent";
  const addrs = deriveSpyAddresses(mnemonic);
  const address = rail === "unlink" ? addrs.unlink : addrs.transparent;
  const oracleSet = new Set([addrs.ethOracle.toLowerCase(), addrs.btcOracle.toLowerCase()]);

  const payments = await readObservablePayments({
    address,
    token: TOKEN,
    rpcUrl: process.env.RPC_URL,
  });

  // Keep incoming (funder) + outgoing only to known oracles (ignore deposit noise).
  const filtered = payments.filter((p) => {
    const a = address.toLowerCase();
    if (p.to.toLowerCase() === a) return true;
    return p.from.toLowerCase() === a && oracleSet.has(p.to.toLowerCase());
  });

  const labels = oracleLabels(addrs);
  const report = reconstruct({ agentAddress: address, payments: filtered, knownOracles: labels });

  // Real on-chain proof: the actual Transfer txs the spy read, linked to ArcScan.
  const explorerBase = arcTestnet.blockExplorers?.default?.url ?? "https://testnet.arcscan.app";
  const txs = filtered
    .filter((p) => p.txHash)
    .map((p) => {
      const out = p.from.toLowerCase() === address.toLowerCase();
      const counterparty = (out ? p.to : p.from).toLowerCase();
      return {
        hash: p.txHash!,
        url: `${explorerBase}/tx/${p.txHash}`,
        kind: out ? ("out" as const) : ("in" as const),
        label: out ? labels[counterparty] ?? "oracle" : "funding",
        amount: p.amount,
      };
    });

  return NextResponse.json({ rail, address, report, txs, explorerBase });
}
