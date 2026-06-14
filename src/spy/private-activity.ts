import { fromBaseUnits } from "../unlink/config.js";

export interface PrivateActivitySummary {
  agentTxCount: number;
  sellersReceived: { label: string; amount: string }[];
}

/**
 * Shape the owner's private engine view into the right-panel proof: how many
 * agent transactions the engine recorded, and which oracle sellers actually
 * received funds (zero-balance sellers dropped, amounts formatted to USDC).
 */
export function summarizePrivateActivity(input: {
  txCount: number;
  sellers: { label: string; amountBaseUnits: string }[];
}): PrivateActivitySummary {
  return {
    agentTxCount: input.txCount,
    sellersReceived: input.sellers
      .filter((s) => BigInt(s.amountBaseUnits || "0") > 0n)
      .map((s) => ({ label: s.label, amount: fromBaseUnits(s.amountBaseUnits) })),
  };
}
