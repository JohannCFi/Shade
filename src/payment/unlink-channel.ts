import {
  encodeUnlinkProof,
  type PaymentRequirements,
} from "../x402/types.js";
import type { PaymentChannel, PaymentReceipt } from "./channel.js";

/**
 * Minimal surface of the Unlink client we depend on (the real UnlinkClient's
 * `transfer` satisfies this). Keeps the channel unit-testable with a fake.
 */
export interface UnlinkPrivatePayer {
  transfer(params: {
    token: string;
    amount: string;
    recipientAddress: string;
  }): Promise<{ wait(): Promise<{ status: string }> }>;
}

export interface UnlinkChannelOptions {
  payer: UnlinkPrivatePayer;
  /** Map a seller's on-chain payTo to its Unlink (bech32m) address. */
  resolveSellerUnlinkAddress: (payToEvm: string) => string;
}

/**
 * The Unlink channel: the agent pays each oracle PRIVATELY, inside the Unlink
 * pool. No agent→seller edge is published on-chain, and the agent's funding is
 * decoupled from its spending — so the spy reconstructs nothing. This is the
 * RIGHT side of the demo (the win).
 */
export class UnlinkChannel implements PaymentChannel {
  readonly kind = "unlink" as const;
  readonly payerLabel = "shielded";
  private spent = 0n;

  constructor(private readonly opts: UnlinkChannelOptions) {}

  async pay(req: PaymentRequirements): Promise<PaymentReceipt> {
    const sellerUnlink = this.opts.resolveSellerUnlinkAddress(req.payTo);

    const tx = await this.opts.payer.transfer({
      token: req.asset,
      amount: req.maxAmountRequired,
      recipientAddress: sellerUnlink,
    });
    const result = await tx.wait();
    if (result.status !== "processed") {
      throw new Error(`unlink transfer for ${req.resource} not processed: ${result.status}`);
    }

    const header = encodeUnlinkProof({
      scheme: "unlink",
      network: req.network,
      token: req.asset,
      amount: req.maxAmountRequired,
      to: sellerUnlink,
      txId: `unlink:${req.resource}:${Date.now()}`,
    });

    this.spent += BigInt(req.maxAmountRequired);
    return {
      resource: req.resource,
      amount: req.maxAmountRequired,
      header,
      // Invisible: the payment happens inside the privacy pool.
      observable: null,
    };
  }

  totalSpent(): bigint {
    return this.spent;
  }
}
