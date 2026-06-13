import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { arcTestnet } from "viem/chains";
import type { ObservablePayment } from "./types.js";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

/**
 * Read what a chain observer actually sees: ERC-20 (USDC) Transfer logs touching
 * an address on Arc, normalized to ObservablePayment[]. Feed the result to
 * `reconstruct()`.
 *
 * Transparent rail → the agent's direct transfers show up here. Unlink rail →
 * agent→oracle transfers happen inside the privacy pool and DON'T appear, so the
 * reader returns at most a deposit — nothing to reconstruct. That's the point.
 */
export async function readObservablePayments(opts: {
  address: string;
  token: string;
  rpcUrl?: string;
  fromBlock?: bigint;
}): Promise<ObservablePayment[]> {
  const client = createPublicClient({
    chain: arcTestnet,
    transport: http(opts.rpcUrl ?? arcTestnet.rpcUrls.default.http[0]),
  });
  const address = opts.address as Address;
  const token = opts.token as Address;
  // Arc caps eth_getLogs to a 10k block range — default to a recent window.
  const latest = await client.getBlockNumber();
  const fromBlock = opts.fromBlock ?? (latest > 9000n ? latest - 9000n : 0n);

  const [outgoing, incoming] = await Promise.all([
    client.getLogs({ address: token, event: TRANSFER_EVENT, args: { from: address }, fromBlock, toBlock: "latest" }),
    client.getLogs({ address: token, event: TRANSFER_EVENT, args: { to: address }, fromBlock, toBlock: "latest" }),
  ]);

  const toPayment = (l: (typeof outgoing)[number]): ObservablePayment => ({
    from: l.args.from as string,
    to: l.args.to as string,
    amount: (l.args.value as bigint).toString(),
    asset: token,
    txHash: l.transactionHash ?? undefined,
  });

  return [...outgoing.map(toPayment), ...incoming.map(toPayment)];
}
