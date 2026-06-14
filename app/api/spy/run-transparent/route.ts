import { runTransparentAgentStream } from "@/src/spy/transparent-run";
import { runPrivatePayments } from "@/src/spy/private-run";
import { ndjsonStream } from "@/src/spy/ndjson";
import type { RunEvent } from "@/src/spy/run-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const TOKEN = process.env.UNLINK_TEST_TOKEN ?? "0x3600000000000000000000000000000000000000";

/**
 * Live trigger: run BOTH rails for real and STREAM one NDJSON event per step.
 * Transparent rail (ephemeral agent) streams start/fund/pay/decide so the agent
 * panel + left spy panel fill in real time. Then the private rail pays the same
 * oracles via Unlink and a `private` event carries THIS run's confirmed private
 * payments (delta) for the "verify on engine" proof. POST { ticks? } (capped 1–5).
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
  const apiKey = process.env.UNLINK_API_KEY;

  async function* live(): AsyncGenerator<RunEvent> {
    let agent = "0x0000000000000000000000000000000000000000" as `0x${string}`;
    for await (const e of runTransparentAgentStream({
      mnemonic: mnemonic!,
      token: TOKEN,
      tokenDecimals,
      environment,
      rpcUrl: process.env.RPC_URL,
      ticks,
    })) {
      if (e.kind === "done") { agent = e.agent; continue; }
      yield e;
    }

    // Private rail, best-effort: prove this run's private payments without breaking
    // the demo if the pool is unfunded or the engine is unreachable.
    if (apiKey) {
      try {
        const priv = await runPrivatePayments({
          mnemonic: mnemonic!,
          apiKey,
          environment,
          token: TOKEN,
          rpcUrl: process.env.RPC_URL,
          ticks,
          tokenDecimals,
        });
        yield { kind: "private", payments: priv.payments, sellersReceived: priv.sellersReceived };
      } catch {
        // private proof unavailable — leave it out, the rest of the demo stands
      }
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
