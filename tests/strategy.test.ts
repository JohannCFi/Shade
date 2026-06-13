import { describe, it, expect } from "vitest";
import { decide, describeStrategy, type StrategyInput } from "../src/agent/strategy.js";

const base: StrategyInput = { ethPrice: 3000, ethPrevPrice: 2900, btcSignal: "bullish" };

describe("agent strategy", () => {
  it("BUYs when ETH is rising and BTC signal is bullish", () => {
    expect(decide({ ...base, ethPrice: 3000, ethPrevPrice: 2900, btcSignal: "bullish" })).toBe("BUY");
  });

  it("SELLs when ETH is falling and BTC signal is bearish", () => {
    expect(decide({ ...base, ethPrice: 2800, ethPrevPrice: 2900, btcSignal: "bearish" })).toBe("SELL");
  });

  it("HOLDs when signals disagree (ETH rising but BTC bearish)", () => {
    expect(decide({ ...base, ethPrice: 3000, ethPrevPrice: 2900, btcSignal: "bearish" })).toBe("HOLD");
  });

  it("HOLDs when BTC signal is neutral", () => {
    expect(decide({ ...base, btcSignal: "neutral" })).toBe("HOLD");
  });

  it("HOLDs when ETH price is flat", () => {
    expect(decide({ ...base, ethPrice: 3000, ethPrevPrice: 3000, btcSignal: "bullish" })).toBe("HOLD");
  });

  it("exposes a one-sentence human description (this is what the spy reconstructs)", () => {
    expect(describeStrategy()).toMatch(/ETH/);
    expect(describeStrategy()).toMatch(/BTC/);
  });
});
