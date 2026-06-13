import { describe, it, expect } from "vitest";
import { Paywall } from "../src/oracle/paywall.js";
import { encodePaymentHeader, X402_VERSION, type PaymentPayload } from "../src/x402/types.js";

const PAY_TO = "0x1111111111111111111111111111111111111111";
const ASSET = "0x2222222222222222222222222222222222222222";
const NETWORK = "eip155:84532";

function makePaywall() {
  return new Paywall({
    resource: "GET /oracle/eth",
    description: "ETH price oracle",
    payTo: PAY_TO,
    asset: ASSET,
    network: NETWORK,
    priceUnits: "1000", // 0.001 USDC at 6 decimals
  });
}

function makeHeader(overrides: Partial<PaymentPayload["payload"]> = {}, validBefore = 9_999_999_999) {
  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    scheme: "exact",
    network: NETWORK,
    payload: {
      from: "0x3333333333333333333333333333333333333333",
      to: PAY_TO,
      value: "1000",
      validAfter: 0,
      validBefore,
      nonce: "0x" + "ab".repeat(32),
      signature: "0xdeadbeef",
      ...overrides,
    },
  };
  return encodePaymentHeader(payload);
}

describe("x402 paywall", () => {
  it("requirement() advertises the exact scheme with price and payTo", () => {
    const body = makePaywall().requirement();
    expect(body.x402Version).toBe(X402_VERSION);
    expect(body.accepts).toHaveLength(1);
    expect(body.accepts[0]).toMatchObject({
      scheme: "exact",
      network: NETWORK,
      maxAmountRequired: "1000",
      payTo: PAY_TO,
      asset: ASSET,
    });
  });

  it("rejects a request with no payment header", () => {
    const res = makePaywall().check(undefined);
    expect(res.paid).toBe(false);
  });

  it("accepts a well-formed, sufficient, unexpired authorization", () => {
    const res = makePaywall().check(makeHeader());
    expect(res.paid).toBe(true);
  });

  it("rejects an insufficient amount", () => {
    const res = makePaywall().check(makeHeader({ value: "500" }));
    expect(res).toEqual({ paid: false, reason: "insufficient amount" });
  });

  it("rejects payment to the wrong recipient", () => {
    const res = makePaywall().check(makeHeader({ to: "0x9999999999999999999999999999999999999999" }));
    expect(res).toEqual({ paid: false, reason: "wrong recipient" });
  });

  it("rejects an expired authorization", () => {
    const res = makePaywall().check(makeHeader({}, 1000), 2000);
    expect(res).toEqual({ paid: false, reason: "authorization expired" });
  });

  it("rejects a malformed header", () => {
    const res = makePaywall().check("!!!not-base64-json!!!");
    expect(res.paid).toBe(false);
  });
});
