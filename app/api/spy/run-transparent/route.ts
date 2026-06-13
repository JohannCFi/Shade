import { NextResponse } from "next/server";
import { runTransparentAgent } from "@/src/spy/transparent-run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const TOKEN = process.env.UNLINK_TEST_TOKEN ?? "0x3600000000000000000000000000000000000000";

/**
 * Live trigger: run a real transparent agent (visible on-chain payments) so the
 * LEFT spy panel reconstructs it in real time. POST { ticks?: number } (capped).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const mnemonic = process.env.WALLET_MNEMONIC;
  if (!mnemonic) return NextResponse.json({ error: "server not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const ticks = Math.min(Math.max(Number(body?.ticks) || 3, 1), 5);

  try {
    const res = await runTransparentAgent({
      mnemonic,
      token: TOKEN,
      tokenDecimals: Number(process.env.UNLINK_TOKEN_DECIMALS ?? "6"),
      environment: process.env.UNLINK_ENVIRONMENT ?? "arc-testnet",
      rpcUrl: process.env.RPC_URL,
      ticks,
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
