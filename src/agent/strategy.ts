/**
 * The agent's trading strategy — deliberately trivial (NOT judged by the prize).
 *
 * The whole point of Shade is that THIS logic is what leaks onchain when an
 * agent pays for oracle calls transparently (x402 nu): a competitor reading the
 * payment graph can reconstruct exactly which signals the agent follows and how
 * it acts on them. On Unlink, the same activity is unreadable.
 *
 * Keep it readable in one sentence — `describeStrategy()` is literally what the
 * "spy" panel reconstructs in the demo.
 */

export type BtcSignal = "bullish" | "bearish" | "neutral";
export type Action = "BUY" | "SELL" | "HOLD";

export interface StrategyInput {
  ethPrice: number;
  ethPrevPrice: number;
  btcSignal: BtcSignal;
}

export function decide(input: StrategyInput): Action {
  const ethRising = input.ethPrice > input.ethPrevPrice;
  const ethFalling = input.ethPrice < input.ethPrevPrice;

  if (ethRising && input.btcSignal === "bullish") return "BUY";
  if (ethFalling && input.btcSignal === "bearish") return "SELL";
  return "HOLD";
}

/** One-sentence, human-readable summary of the strategy (the "stolen" secret). */
export function describeStrategy(): string {
  return "Buys ETH when its price is rising and the BTC signal is bullish; sells when ETH falls and BTC turns bearish; otherwise holds.";
}
