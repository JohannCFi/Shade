import type { BtcSignal } from "../agent/strategy.js";
import { Paywall } from "./paywall.js";
import type { PaymentRequiredBody } from "../x402/types.js";

export type OracleValue = number | BtcSignal;

/**
 * An in-process x402 oracle: a paywall + a deterministic value feed. Models the
 * HTTP dance without a network — `read()` returns 402 until a valid X-PAYMENT
 * header is presented, then 200 with the value. The real HTTP endpoints (étape
 * 2a) wrap this same logic.
 */
export type OracleResponse =
  | { status: 402; body: PaymentRequiredBody }
  | { status: 200; value: OracleValue };

export class InProcessOracle {
  constructor(
    readonly paywall: Paywall,
    private readonly valueAt: (tick: number) => OracleValue,
  ) {}

  requirement(): PaymentRequiredBody {
    return this.paywall.requirement();
  }

  read(tick: number, header?: string): OracleResponse {
    const check = this.paywall.check(header);
    if (!check.paid) return { status: 402, body: this.paywall.requirement() };
    return { status: 200, value: this.valueAt(tick) };
  }
}
