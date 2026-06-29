import { runTransparentAgentStream } from "@/src/spy/transparent-run";
import { ndjsonStream } from "@/src/spy/ndjson";
import { registerDemoVenues } from "@/src/defi/demo-registry";
import type { RunEvent } from "@/src/spy/run-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const TOKEN = process.env.UNLINK_TEST_TOKEN ?? "0x3600000000000000000000000000000000000000";

/**
 * Live trigger: run the TRANSPARENT rail for real and STREAM one NDJSON event per
 * step (start/fund/pay/decide + the capital-allocation trades). The private rail
 * is a SEPARATE request (`/api/spy/run-private`) so each rail gets its own 60s
 * serverless window — running both here blew the Vercel limit. POST { ticks? }.
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
  const tokenDecimals = Number(process.env.UNLINK_TOKEN_DECIMALS ?? "6");
  const environment = process.env.UNLINK_ENVIRONMENT ?? "arc-testnet";

  // The DeFi venues the agent allocates into (vault/swap/aave) — empty if unconfigured.
  const venues = registerDemoVenues();

  async function* live(): AsyncGenerator<RunEvent> {
    let agent = "0x0000000000000000000000000000000000000000" as `0x${string}`;
    for await (const e of runTransparentAgentStream({
      mnemonic: mnemonic!,
      token: TOKEN,
      tokenDecimals,
      environment,
      rpcUrl: process.env.RPC_URL,
      ticks,
      venues,
    })) {
      if (e.kind === "done") { agent = e.agent; continue; }
      yield e;
    }
    yield { kind: "done", agent };
  }

  return new Response(ndjsonStream(live()), {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store, no-transform",
    },
  });
}
