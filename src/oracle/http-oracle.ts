import { X_PAYMENT_HEADER, type PaymentRequiredBody } from "../x402/types.js";
import type { OracleReader, OracleResponse, OracleValue } from "./oracle.js";

/**
 * Talks to a real x402 oracle HTTP endpoint. Lets the agent loop run against
 * the live Next.js routes instead of in-process objects.
 */
export class HttpOracle implements OracleReader {
  constructor(
    readonly resource: string,
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async read(tick: number, header?: string): Promise<OracleResponse> {
    const u = new URL(this.url);
    u.searchParams.set("tick", String(tick));

    const res = await this.fetchImpl(u.toString(), {
      headers: header ? { [X_PAYMENT_HEADER]: header } : {},
    });

    if (res.status === 402) {
      const body = (await res.json()) as PaymentRequiredBody;
      return { status: 402, body };
    }
    if (res.status === 200) {
      const data = (await res.json()) as { value: OracleValue };
      return { status: 200, value: data.value };
    }
    throw new Error(`oracle ${this.resource} returned HTTP ${res.status}`);
  }
}
