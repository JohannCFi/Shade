import { describe, it, expect } from "vitest";
import { runAgent } from "../src/agent/loop.js";
import { InProcessOracle } from "../src/oracle/oracle.js";
import { Paywall } from "../src/oracle/paywall.js";
import { MockPaymentChannel } from "../src/payment/channel.js";
import { ethPriceAt, btcSignalAt } from "../src/oracle/feed.js";

const NETWORK = "eip155:84532";
const ASSET = "0x2222222222222222222222222222222222222222";
const ETH_SELLER = "0xeee1111111111111111111111111111111111111";
const BTC_SELLER = "0xbbb2222222222222222222222222222222222222";
const AGENT = "0xa6e07000000000000000000000000000000000a1";

function buildOracles() {
  const ethOracle = new InProcessOracle(
    new Paywall({ resource: "GET /oracle/eth", description: "ETH price", payTo: ETH_SELLER, asset: ASSET, network: NETWORK, priceUnits: "1000" }),
    ethPriceAt,
  );
  const btcOracle = new InProcessOracle(
    new Paywall({ resource: "GET /oracle/btc", description: "BTC signal", payTo: BTC_SELLER, asset: ASSET, network: NETWORK, priceUnits: "1000" }),
    btcSignalAt,
  );
  return { ethOracle, btcOracle };
}

describe("agent loop", () => {
  it("pays for both oracles every tick and produces a decision each tick", async () => {
    const { ethOracle, btcOracle } = buildOracles();
    const channel = new MockPaymentChannel("transparent", AGENT);
    const result = await runAgent({ ethOracle, btcOracle, channel, ticks: 5 });

    expect(result.ticks).toHaveLength(5);
    for (const t of result.ticks) {
      expect(t.receipts).toHaveLength(2);
      expect(["BUY", "SELL", "HOLD"]).toContain(t.action);
    }
    // 5 ticks * 2 oracles * 1000 units
    expect(result.totalSpent).toBe(10_000n);
  });

  it("transparent channel exposes every agent→seller payment to the spy", async () => {
    const { ethOracle, btcOracle } = buildOracles();
    const channel = new MockPaymentChannel("transparent", AGENT);
    const result = await runAgent({ ethOracle, btcOracle, channel, ticks: 3 });

    expect(result.observablePayments).toHaveLength(6); // 3 ticks * 2 sellers
    expect(result.observablePayments.every((p) => p.from === AGENT)).toBe(true);
    expect(result.observablePayments.map((p) => p.to)).toContain(ETH_SELLER);
    expect(result.observablePayments.map((p) => p.to)).toContain(BTC_SELLER);
  });

  it("unlink channel leaks NOTHING to the spy (same agent, same spend)", async () => {
    const { ethOracle, btcOracle } = buildOracles();
    const channel = new MockPaymentChannel("unlink", AGENT);
    const result = await runAgent({ ethOracle, btcOracle, channel, ticks: 3 });

    expect(result.totalSpent).toBe(6_000n); // identical economic activity
    expect(result.observablePayments).toHaveLength(0); // ...but invisible
    expect(channel.payerLabel).toBe("shielded");
  });
});
