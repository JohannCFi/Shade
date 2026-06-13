import { describe, it, expect } from "vitest";
import { GET as ethGET } from "../app/api/oracle/eth/route.js";
import { GET as btcGET } from "../app/api/oracle/btc/route.js";
import { HttpOracle } from "../src/oracle/http-oracle.js";
import { MockPaymentChannel } from "../src/payment/channel.js";
import { runAgent } from "../src/agent/loop.js";
import {
  encodePaymentHeader,
  X402_VERSION,
  X_PAYMENT_HEADER,
  type PaymentRequiredBody,
} from "../src/x402/types.js";
import { ETH_ORACLE_PAYTO, NETWORK, PRICE_UNITS } from "../src/oracle/oracle-config.js";

const BASE = "http://localhost/api/oracle/eth";

function payHeaderFor(payTo: string) {
  return encodePaymentHeader({
    x402Version: X402_VERSION,
    scheme: "exact",
    network: NETWORK,
    payload: {
      from: "0xa6e07000000000000000000000000000000000a1",
      to: payTo,
      value: PRICE_UNITS,
      validAfter: 0,
      validBefore: Math.floor(Date.now() / 1000) + 300,
      nonce: "0x" + "11".repeat(32),
      signature: "0xmock",
    },
  });
}

describe("oracle HTTP route (x402)", () => {
  it("returns 402 with a valid PaymentRequired body when unpaid", async () => {
    const res = await ethGET(new Request(`${BASE}?tick=3`));
    expect(res.status).toBe(402);
    const body = (await res.json()) as PaymentRequiredBody;
    expect(body.x402Version).toBe(X402_VERSION);
    expect(body.accepts[0]).toMatchObject({
      scheme: "exact",
      network: NETWORK,
      payTo: ETH_ORACLE_PAYTO,
      maxAmountRequired: PRICE_UNITS,
    });
  });

  it("returns 200 with the value when a valid payment header is presented", async () => {
    const res = await ethGET(
      new Request(`${BASE}?tick=3`, {
        headers: { [X_PAYMENT_HEADER]: payHeaderFor(ETH_ORACLE_PAYTO) },
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { resource: string; tick: number; value: number };
    expect(data.tick).toBe(3);
    expect(typeof data.value).toBe("number");
  });

  it("rejects a payment addressed to the wrong oracle (402)", async () => {
    const res = await btcGET(
      new Request("http://localhost/api/oracle/btc?tick=1", {
        headers: { [X_PAYMENT_HEADER]: payHeaderFor(ETH_ORACLE_PAYTO) },
      }),
    );
    expect(res.status).toBe(402); // BTC oracle won't accept ETH oracle's payTo
  });
});

describe("agent loop over real HTTP routes", () => {
  it("drives the agent against the route handlers via fetch", async () => {
    // Map oracle URLs to their Next GET handlers (no server needed).
    const routedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const req = new Request(url, { headers: init?.headers });
      return url.includes("/oracle/eth") ? ethGET(req) : btcGET(req);
    }) as unknown as typeof fetch;

    const ethOracle = new HttpOracle("GET /api/oracle/eth", "http://localhost/api/oracle/eth", routedFetch);
    const btcOracle = new HttpOracle("GET /api/oracle/btc", "http://localhost/api/oracle/btc", routedFetch);
    const channel = new MockPaymentChannel("transparent", "0xa6e07000000000000000000000000000000000a1");

    const result = await runAgent({ ethOracle, btcOracle, channel, ticks: 4 });
    expect(result.ticks).toHaveLength(4);
    expect(result.observablePayments).toHaveLength(8); // 4 ticks * 2 oracles
    expect(result.totalSpent).toBe(BigInt(PRICE_UNITS) * 8n);
  });
});
