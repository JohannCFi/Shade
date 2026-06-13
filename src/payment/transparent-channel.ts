import { type Address, type Hex, type TypedDataDefinition } from "viem";
import {
  encodePaymentHeader,
  X402_VERSION,
  type PaymentRequirements,
} from "../x402/types.js";
import type { PaymentChannel, PaymentReceipt } from "./channel.js";
import {
  buildTransferAuthorizationTypedData,
  randomNonce,
  type Eip712TokenDomain,
  type TransferAuthorizationMessage,
} from "./eip3009.js";

/** Minimal viem-account surface we need (a LocalAccount satisfies this). */
export interface TypedDataSigner {
  address: Address;
  signTypedData(parameters: TypedDataDefinition): Promise<Hex>;
}

export interface TransparentChannelOptions {
  account: TypedDataSigner;
  /** EIP-712 token name (must match the asset's domain for real settlement). */
  tokenName: string;
  /** EIP-712 token version. */
  tokenVersion: string;
}

/**
 * The "x402 nu" channel: the agent's own EOA signs a real EIP-3009
 * authorization. Payer = the agent's persistent address, so every oracle
 * payment is attributable on-chain — a competitor clusters them and
 * reconstructs the agent's strategy, budget and funder. This is the LEFT side
 * of the demo (the cautionary tale).
 */
export class TransparentChannel implements PaymentChannel {
  readonly kind = "transparent" as const;
  private spent = 0n;

  constructor(private readonly opts: TransparentChannelOptions) {}

  get payerLabel(): string {
    return this.opts.account.address;
  }

  async pay(req: PaymentRequirements): Promise<PaymentReceipt> {
    const chainId = Number(req.network.split(":")[1]);
    const value = BigInt(req.maxAmountRequired);
    const validAfter = 0n;
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + req.maxTimeoutSeconds);
    const nonce = randomNonce();
    const from = this.opts.account.address;

    const domain: Eip712TokenDomain = {
      name: this.opts.tokenName,
      version: this.opts.tokenVersion,
      chainId,
      verifyingContract: req.asset as Address,
    };
    const message: TransferAuthorizationMessage = {
      from,
      to: req.payTo as Address,
      value,
      validAfter,
      validBefore,
      nonce,
    };

    const signature = await this.opts.account.signTypedData(
      buildTransferAuthorizationTypedData(domain, message) as unknown as TypedDataDefinition,
    );

    const header = encodePaymentHeader({
      x402Version: X402_VERSION,
      scheme: "exact",
      network: req.network,
      payload: {
        from,
        to: req.payTo,
        value: req.maxAmountRequired,
        validAfter: Number(validAfter),
        validBefore: Number(validBefore),
        nonce,
        signature,
      },
    });

    this.spent += value;
    return {
      resource: req.resource,
      amount: req.maxAmountRequired,
      header,
      // Visible: once settled, this is a plain agent→seller transfer on-chain.
      observable: { from, to: req.payTo, amount: req.maxAmountRequired },
    };
  }

  totalSpent(): bigint {
    return this.spent;
  }
}
