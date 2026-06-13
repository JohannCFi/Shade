import { decide, type Action, type BtcSignal } from "./strategy.js";
import type { OracleReader } from "../oracle/oracle.js";
import type { PaymentChannel, PaymentReceipt } from "../payment/channel.js";

/**
 * The agent: each tick it pays for an ETH price quote and a BTC signal quote
 * (via the x402 oracles), then applies its strategy. Every paid call goes
 * through the PaymentChannel — swapping a transparent channel for an Unlink one
 * is the only difference between the two halves of the demo.
 */
export interface AgentTick {
  tick: number;
  ethPrice: number;
  btcSignal: BtcSignal;
  action: Action;
  receipts: PaymentReceipt[];
}

export interface AgentRunResult {
  ticks: AgentTick[];
  totalSpent: bigint;
  /** Payments a chain observer could attribute to the agent. */
  observablePayments: { from: string; to: string; amount: string }[];
}

/** Pay-then-read an oracle: handle the 402, pay via the channel, retry. */
async function paidRead(
  oracle: OracleReader,
  channel: PaymentChannel,
  tick: number,
): Promise<{ value: number | BtcSignal; receipt: PaymentReceipt }> {
  const first = await oracle.read(tick);
  if (first.status === 200) {
    throw new Error("oracle returned data without requiring payment");
  }
  const req = first.body.accepts[0];
  const receipt = await channel.pay(req);
  const second = await oracle.read(tick, receipt.header);
  if (second.status !== 200) {
    throw new Error(`oracle rejected payment for ${req.resource}`);
  }
  return { value: second.value, receipt };
}

export interface RunAgentOptions {
  ethOracle: OracleReader;
  btcOracle: OracleReader;
  channel: PaymentChannel;
  ticks: number;
}

export async function runAgent(opts: RunAgentOptions): Promise<AgentRunResult> {
  const { ethOracle, btcOracle, channel, ticks } = opts;
  const out: AgentTick[] = [];
  const observablePayments: { from: string; to: string; amount: string }[] = [];
  let prevEth = 0;

  for (let tick = 0; tick < ticks; tick++) {
    const eth = await paidRead(ethOracle, channel, tick);
    const btc = await paidRead(btcOracle, channel, tick);

    const ethPrice = eth.value as number;
    const btcSignal = btc.value as BtcSignal;
    const ethPrevPrice = tick === 0 ? ethPrice : prevEth;

    const action = decide({ ethPrice, ethPrevPrice, btcSignal });
    const receipts = [eth.receipt, btc.receipt];
    for (const r of receipts) if (r.observable) observablePayments.push(r.observable);

    out.push({ tick, ethPrice, btcSignal, action, receipts });
    prevEth = ethPrice;
  }

  return { ticks: out, totalSpent: channel.totalSpent(), observablePayments };
}
