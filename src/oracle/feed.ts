import type { BtcSignal } from "../agent/strategy.js";

/**
 * Deterministic market data feeds, keyed by an integer tick. Deterministic so
 * the agent loop, tests, and the demo are all reproducible (no real market
 * dependency — the oracle is mocked, as per scope).
 */

/** ETH price oscillates around 3000 with a smooth, repeatable wave. */
export function ethPriceAt(tick: number): number {
  const wave = Math.sin(tick / 3) * 200 + Math.sin(tick / 7) * 60;
  return Math.round((3000 + wave) * 100) / 100;
}

/**
 * BTC signal cycles bullish → neutral → bearish on a different period than ETH,
 * so the two feeds sometimes agree (→ BUY/SELL) and sometimes don't (→ HOLD).
 */
export function btcSignalAt(tick: number): BtcSignal {
  const phase = ((tick % 6) + 6) % 6;
  if (phase < 2) return "bullish";
  if (phase < 4) return "neutral";
  return "bearish";
}
