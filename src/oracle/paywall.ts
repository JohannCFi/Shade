import {
  X402_VERSION,
  decodePaymentHeader,
  type Eip3009Authorization,
  type PaymentRequiredBody,
  type PaymentRequirements,
} from "../x402/types.js";

/**
 * An x402 paywall for a single mocked oracle resource. Frameworks-agnostic:
 * `requirement()` produces the 402 body; `check(header)` validates the retry's
 * X-PAYMENT header. The real settlement (Circle Nanopayments) happens later;
 * here we verify the payment authorization is well-formed and sufficient.
 */
export interface PaywallConfig {
  resource: string;
  description: string;
  /** Seller address receiving payment. */
  payTo: string;
  /** ERC-20 asset (USDC test token). */
  asset: string;
  /** CAIP-2 network, e.g. "eip155:84532". */
  network: string;
  /** Price per call, in the asset's smallest unit (decimal string). */
  priceUnits: string;
  maxTimeoutSeconds?: number;
}

export type PaymentCheck =
  | { paid: true; auth: Eip3009Authorization }
  | { paid: false; reason: string };

export class Paywall {
  constructor(private readonly cfg: PaywallConfig) {}

  private requirements(): PaymentRequirements {
    return {
      scheme: "exact",
      network: this.cfg.network,
      maxAmountRequired: this.cfg.priceUnits,
      resource: this.cfg.resource,
      description: this.cfg.description,
      mimeType: "application/json",
      payTo: this.cfg.payTo,
      maxTimeoutSeconds: this.cfg.maxTimeoutSeconds ?? 300,
      asset: this.cfg.asset,
    };
  }

  /** The body to return with HTTP 402. */
  requirement(): PaymentRequiredBody {
    return { x402Version: X402_VERSION, accepts: [this.requirements()] };
  }

  /** Validate the X-PAYMENT header from the buyer's retry. */
  check(header: string | undefined, now: number = Math.floor(Date.now() / 1000)): PaymentCheck {
    if (!header) return { paid: false, reason: "missing X-PAYMENT header" };

    let payload;
    try {
      payload = decodePaymentHeader(header);
    } catch {
      return { paid: false, reason: "malformed X-PAYMENT header" };
    }

    if (payload.scheme !== "exact") return { paid: false, reason: "unsupported scheme" };
    if (payload.network !== this.cfg.network) return { paid: false, reason: "wrong network" };

    const a = payload.payload;
    if (!a?.signature) return { paid: false, reason: "missing signature" };
    if (a.to.toLowerCase() !== this.cfg.payTo.toLowerCase())
      return { paid: false, reason: "wrong recipient" };
    if (BigInt(a.value) < BigInt(this.cfg.priceUnits))
      return { paid: false, reason: "insufficient amount" };
    if (a.validBefore <= now) return { paid: false, reason: "authorization expired" };

    return { paid: true, auth: a };
  }
}
