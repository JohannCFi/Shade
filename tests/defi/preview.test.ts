import { describe, it, expect } from "vitest";
import { applySlippage } from "../../src/defi/preview.js";

describe("applySlippage", () => {
  it("subtracts the slippage margin in bps", () => {
    expect(applySlippage(10_000n, 50)).toBe(9_950n); // 0.50%
  });
  it("is identity at 0 bps", () => {
    expect(applySlippage(10_000n, 0)).toBe(10_000n);
  });
  it("rounds down (floor)", () => {
    expect(applySlippage(3n, 50)).toBe(2n); // 3*9950/10000 = 2.985 -> 2
  });
  it("throws on negative or >10000 bps", () => {
    expect(() => applySlippage(1n, -1)).toThrow();
    expect(() => applySlippage(1n, 10_001)).toThrow();
  });
});
