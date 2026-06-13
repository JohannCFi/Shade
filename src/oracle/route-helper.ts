import { Paywall } from "./paywall.js";
import { X_PAYMENT_HEADER } from "../x402/types.js";
import { currentTick } from "./oracle-config.js";
import type { OracleValue } from "./oracle.js";

/**
 * Web-standard (Request → Response) x402 handler shared by the oracle routes.
 * Framework-agnostic so it can be unit-tested without booting Next.
 *
 *   no/invalid X-PAYMENT  → 402 + PaymentRequired body
 *   valid X-PAYMENT       → 200 + { resource, tick, value }
 */
export function handleOracleRequest(
  request: Request,
  paywall: Paywall,
  valueAt: (tick: number) => OracleValue,
  resource: string,
): Response {
  const url = new URL(request.url);
  const tickParam = url.searchParams.get("tick");
  const tick = tickParam !== null ? Number(tickParam) : currentTick();

  const header = request.headers.get(X_PAYMENT_HEADER) ?? undefined;
  const check = paywall.check(header);

  if (!check.paid) {
    return Response.json(paywall.requirement(), {
      status: 402,
      headers: { "cache-control": "no-store" },
    });
  }

  return Response.json(
    { resource, tick, value: valueAt(tick) },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
