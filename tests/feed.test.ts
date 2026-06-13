import { describe, it, expect } from "vitest";
import { ethPriceAt, btcSignalAt } from "../src/oracle/feed.js";

describe("oracle feeds", () => {
  it("ethPriceAt is deterministic for the same tick", () => {
    expect(ethPriceAt(5)).toBe(ethPriceAt(5));
  });

  it("ethPriceAt stays in a sane band around 3000", () => {
    for (let t = 0; t < 100; t++) {
      const p = ethPriceAt(t);
      expect(p).toBeGreaterThan(2600);
      expect(p).toBeLessThan(3400);
    }
  });

  it("btcSignalAt cycles through all three signals", () => {
    const seen = new Set(Array.from({ length: 6 }, (_, t) => btcSignalAt(t)));
    expect(seen).toEqual(new Set(["bullish", "neutral", "bearish"]));
  });

  it("btcSignalAt handles negative ticks without crashing", () => {
    expect(["bullish", "neutral", "bearish"]).toContain(btcSignalAt(-1));
  });
});
