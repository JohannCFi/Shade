/**
 * Headless preview of the split-screen demo (no chain, no credentials).
 * Runs the SAME agent over the SAME oracles twice — once on a transparent
 * channel, once on an Unlink channel — and prints what a competitor's "spy"
 * indexer could reconstruct in each case.
 *
 * Run: npx tsx scripts/demo-agent.ts
 */
import { runAgent } from "../src/agent/loop.js";
import { InProcessOracle } from "../src/oracle/oracle.js";
import { Paywall } from "../src/oracle/paywall.js";
import { MockPaymentChannel, type ChannelKind } from "../src/payment/channel.js";
import { ethPriceAt, btcSignalAt } from "../src/oracle/feed.js";
import { describeStrategy } from "../src/agent/strategy.js";

const NETWORK = "eip155:84532";
const ASSET = "0xUSDCtestxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const ETH_SELLER = "0xETHoraclexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const BTC_SELLER = "0xBTCsignalxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const AGENT = "0xAGENTwalletxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const OWNER = "0xOWNERfunderxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

function oracles() {
  return {
    ethOracle: new InProcessOracle(
      new Paywall({ resource: "GET /oracle/eth", description: "ETH price", payTo: ETH_SELLER, asset: ASSET, network: NETWORK, priceUnits: "1000" }),
      ethPriceAt,
    ),
    btcOracle: new InProcessOracle(
      new Paywall({ resource: "GET /oracle/btc", description: "BTC signal", payTo: BTC_SELLER, asset: ASSET, network: NETWORK, priceUnits: "1000" }),
      btcSignalAt,
    ),
  };
}

async function spyView(kind: ChannelKind) {
  const { ethOracle, btcOracle } = oracles();
  const channel = new MockPaymentChannel(kind, AGENT);
  const result = await runAgent({ ethOracle, btcOracle, channel, ticks: 6 });

  console.log(`\n${"=".repeat(58)}`);
  console.log(kind === "transparent" ? " LEFT  — x402 nu (transparent)" : " RIGHT — même agent sur Unlink");
  console.log("=".repeat(58));
  console.log(`Owner funder seen funding agent : ${kind === "transparent" ? OWNER : "—"}`);
  console.log(`Agent payer address             : ${channel.payerLabel}`);

  const spy = result.observablePayments;
  if (spy.length === 0) {
    console.log("Payments visible to a competitor: NONE (just noise)");
    console.log("Reconstructed strategy          : ??? (unreadable)");
    console.log("Reconstructed budget            : ??? (unreadable)");
  } else {
    const sellers = [...new Set(spy.map((p) => p.to))];
    console.log(`Payments visible to a competitor: ${spy.length}`);
    console.log(`Oracles the agent queries       : ${sellers.join(", ")}`);
    console.log(`Reconstructed budget (spent)    : ${result.totalSpent} units`);
    console.log(`Reconstructed strategy          : "${describeStrategy()}"`);
  }
}

async function main() {
  console.log("SHADE — what a competitor sees on-chain (headless preview)");
  await spyView("transparent");
  await spyView("unlink");
  console.log("\nMême agent, même dépense, mêmes décisions — seul le canal change.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
