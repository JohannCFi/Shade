import { runTransparentAgentStream } from "@/src/spy/transparent-run";
import { ndjsonStream } from "@/src/spy/ndjson";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const TOKEN = process.env.UNLINK_TEST_TOKEN ?? "0x3600000000000000000000000000000000000000";

/**
 * Live trigger: run a real transparent agent and STREAM one NDJSON event per
 * mined tx (start/fund/pay/decide/done), so the /spy client fills the agent
 * panel and the left spy panel in real time. POST { ticks?: number } (capped 1–5).
 */
export async function POST(request: Request): Promise<Response> {
  const mnemonic = process.env.WALLET_MNEMONIC;
  if (!mnemonic) {
    return new Response(JSON.stringify({ kind: "error", message: "server not configured" }) + "\n", {
      status: 500,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  const body = await request.json().catch(() => ({}));
  const ticks = Math.min(Math.max(Number(body?.ticks) || 3, 1), 5);

  const events = runTransparentAgentStream({
    mnemonic,
    token: TOKEN,
    tokenDecimals: Number(process.env.UNLINK_TOKEN_DECIMALS ?? "6"),
    environment: process.env.UNLINK_ENVIRONMENT ?? "arc-testnet",
    rpcUrl: process.env.RPC_URL,
    ticks,
  });

  return new Response(ndjsonStream(events), {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store, no-transform",
    },
  });
}
