import { NextResponse } from "next/server";
import { runPrivatePayments } from "@/src/spy/private-run";
import { registerDemoVenues } from "@/src/defi/demo-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby ceiling — the private rail gets its OWN window.

const TOKEN = process.env.UNLINK_TEST_TOKEN ?? "0x3600000000000000000000000000000000000000";

/**
 * Private rail, decoupled from the transparent stream so each gets its own 60s
 * serverless window (the two together blew the limit). Runs the same oracle
 * payments + DeFi allocations privately and returns this run's proof. A time
 * budget caps how many execute() calls we start so the request always returns
 * within the window; the reason is surfaced (never a silent failure).
 *
 * POST { ticks? } → { ok:true, payments, sellersReceived, withdrawals, defi, explorerBase }
 *                 | { ok:false, reason }
 */
export async function POST(request: Request): Promise<NextResponse> {
  const mnemonic = process.env.WALLET_MNEMONIC;
  const apiKey = process.env.UNLINK_API_KEY;
  if (!mnemonic) return NextResponse.json({ ok: false, reason: "server not configured (no WALLET_MNEMONIC)" });
  if (!apiKey) return NextResponse.json({ ok: false, reason: "private rail disabled (no UNLINK_API_KEY on the server)" });

  const tokenDecimals = Number(process.env.UNLINK_TOKEN_DECIMALS ?? "6");
  const environment = process.env.UNLINK_ENVIRONMENT ?? "arc-testnet";
  const venues = registerDemoVenues();

  try {
    const priv = await runPrivatePayments({
      mnemonic,
      apiKey,
      environment,
      token: TOKEN,
      rpcUrl: process.env.RPC_URL,
      // Keep the private oracle proof short (1 tick = 2 private transfers) so the
      // DeFi allocations have room to run inside the 60s Hobby window.
      ticks: 1,
      tokenDecimals,
      venues,
      // Stop starting new execute() calls ~50s in, leaving headroom to return < 60s.
      deadlineMs: Date.now() + 50_000,
    });
    return NextResponse.json({ ok: true, ...priv });
  } catch (err) {
    return NextResponse.json({ ok: false, reason: (err as Error)?.message ?? "private rail failed" });
  }
}
