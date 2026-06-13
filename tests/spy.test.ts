import { describe, it, expect } from "vitest";
import { reconstruct } from "../src/spy/reconstruct.js";
import type { ObservablePayment } from "../src/spy/types.js";

const AGENT = "0xA6E07000000000000000000000000000000000a1";
const OWNER = "0x0wnerFunder000000000000000000000000000001";
const ETH = "0x1111111111111111111111111111111111111111";
const BTC = "0x2222222222222222222222222222222222222222";
const LABELS = { [ETH.toLowerCase()]: "ETH price", [BTC.toLowerCase()]: "BTC signal" };

function transparentPayments(): ObservablePayment[] {
  const p: ObservablePayment[] = [{ from: OWNER, to: AGENT, amount: "5000000" }]; // funding
  for (let i = 0; i < 3; i++) {
    p.push({ from: AGENT, to: ETH, amount: "1000" });
    p.push({ from: AGENT, to: BTC, amount: "1000" });
  }
  return p;
}

describe("spy reconstruct — transparent rail (x402 nu)", () => {
  it("reconstructs payer, funder, oracles, budget and strategy", () => {
    const r = reconstruct({ agentAddress: AGENT, payments: transparentPayments(), knownOracles: LABELS });
    expect(r.readable).toBe(true);
    expect(r.payer?.toLowerCase()).toBe(AGENT.toLowerCase());
    expect(r.funder?.toLowerCase()).toBe(OWNER.toLowerCase());
    expect(r.totalSpent).toBe("6000"); // 6 calls * 1000
    expect(r.oracles).toHaveLength(2);
    expect(r.oracles.every((o) => o.calls === 3)).toBe(true);
    expect(r.inferredStrategy).toMatch(/ETH price/);
    expect(r.inferredStrategy).toMatch(/BTC signal/);
  });

  it("ranks oracles by call count", () => {
    const payments: ObservablePayment[] = [
      { from: AGENT, to: ETH, amount: "1000" },
      { from: AGENT, to: BTC, amount: "1000" },
      { from: AGENT, to: BTC, amount: "1000" },
    ];
    const r = reconstruct({ agentAddress: AGENT, payments });
    expect(r.oracles[0].oracle.toLowerCase()).toBe(BTC.toLowerCase());
    expect(r.oracles[0].calls).toBe(2);
  });
});

describe("spy reconstruct — Unlink rail (private)", () => {
  it("reconstructs NOTHING when there are no observable agent payments", () => {
    const r = reconstruct({ agentAddress: AGENT, payments: [], knownOracles: LABELS });
    expect(r.readable).toBe(false);
    expect(r.payer).toBeNull();
    expect(r.funder).toBeNull();
    expect(r.oracles).toEqual([]);
    expect(r.totalSpent).toBe("0");
    expect(r.inferredStrategy).toBeNull();
  });

  it("a lone deposit (no spending) still reveals no strategy", () => {
    // Unlink deposits are public, but they reveal no agent→oracle edges.
    const r = reconstruct({ agentAddress: AGENT, payments: [{ from: OWNER, to: AGENT, amount: "5000000" }] });
    expect(r.readable).toBe(false);
    expect(r.oracles).toEqual([]);
    expect(r.inferredStrategy).toBeNull();
  });
});
