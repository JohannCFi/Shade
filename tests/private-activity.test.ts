import { describe, it, expect } from "vitest";
import { summarizePrivateActivity } from "../src/spy/private-activity.js";

describe("summarizePrivateActivity", () => {
  it("counts agent txs and formats non-zero seller balances to USDC", () => {
    const s = summarizePrivateActivity({
      txCount: 6,
      sellers: [
        { label: "ETH price", amountBaseUnits: "3000" },
        { label: "BTC signal", amountBaseUnits: "3000" },
      ],
    });
    expect(s.agentTxCount).toBe(6);
    expect(s.sellersReceived).toEqual([
      { label: "ETH price", amount: "0.003" },
      { label: "BTC signal", amount: "0.003" },
    ]);
  });

  it("drops sellers that received nothing", () => {
    const s = summarizePrivateActivity({
      txCount: 0,
      sellers: [{ label: "ETH price", amountBaseUnits: "0" }],
    });
    expect(s.sellersReceived).toEqual([]);
  });
});
