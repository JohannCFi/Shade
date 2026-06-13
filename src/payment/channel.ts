import {
  encodePaymentHeader,
  X402_VERSION,
  type PaymentRequirements,
} from "../x402/types.js";

/**
 * A PaymentChannel turns an x402 PaymentRequirements into a payable X-PAYMENT
 * header. The two real implementations differ ONLY in what they leak onchain:
 *
 *  - "transparent": the agent's own funded EOA signs the EIP-3009 authorization.
 *    Payer address, amount and recipient are all visible — a competitor reading
 *    the chain reconstructs the agent's strategy, budget and funder.
 *  - "unlink": the payment is routed through a shielded Unlink account, so the
 *    owner→agent funding edge and the agent→seller spending edges are unreadable.
 *
 * The agent loop is written against this interface, so the demo's split-screen
 * is just "same agent, two channels".
 */
export type ChannelKind = "transparent" | "unlink";

export interface PaymentReceipt {
  resource: string;
  /** Amount paid, smallest unit (decimal string). */
  amount: string;
  /** The base64 X-PAYMENT header handed back to the oracle. */
  header: string;
  /**
   * What a chain observer can attribute to the agent for THIS payment.
   * `null` on the unlink channel — that's the whole point.
   */
  observable: { from: string; to: string; amount: string } | null;
}

export interface PaymentChannel {
  readonly kind: ChannelKind;
  /** The payer identity exposed onchain (an address, or "shielded"). */
  readonly payerLabel: string;
  pay(req: PaymentRequirements): Promise<PaymentReceipt>;
  /** Total spent so far, smallest unit. */
  totalSpent(): bigint;
}

/**
 * In-memory channel for tests and the headless agent demo. Produces a
 * paywall-valid X-PAYMENT header without touching a chain. `kind` controls
 * whether each payment is observable (transparent) or not (unlink), so the
 * spy indexer can be tested against both.
 */
export class MockPaymentChannel implements PaymentChannel {
  private spent = 0n;
  private nonceSeq = 0;

  constructor(
    readonly kind: ChannelKind,
    private readonly from: string,
  ) {}

  get payerLabel(): string {
    return this.kind === "unlink" ? "shielded" : this.from;
  }

  async pay(req: PaymentRequirements): Promise<PaymentReceipt> {
    const amount = req.maxAmountRequired;
    this.spent += BigInt(amount);
    const nonce = "0x" + (this.nonceSeq++).toString(16).padStart(64, "0");
    const now = Math.floor(Date.now() / 1000);

    const header = encodePaymentHeader({
      x402Version: X402_VERSION,
      scheme: "exact",
      network: req.network,
      payload: {
        from: this.from,
        to: req.payTo,
        value: amount,
        validAfter: 0,
        validBefore: now + req.maxTimeoutSeconds,
        nonce,
        signature: "0xmock",
      },
    });

    return {
      resource: req.resource,
      amount,
      header,
      observable:
        this.kind === "transparent"
          ? { from: this.from, to: req.payTo, amount }
          : null,
    };
  }

  totalSpent(): bigint {
    return this.spent;
  }
}
