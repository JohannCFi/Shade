import {
  X402_VERSION,
  decodeHeaderScheme,
  decodePaymentHeader,
  type Eip3009Authorization,
  type PaymentRequiredBody,
  type PaymentRequirements,
  type UnlinkPaymentProof,
} from "../x402/types.js";

/**
 * An x402 paywall for a single mocked oracle resource. Frameworks-agnostic:
 * `requirement()` produces the 402 body; `check(header)` validates the retry's
 * X-PAYMENT header.
 *
 * Accepts TWO payment rails so the SAME oracle works in both halves of the demo:
 *   - "exact"  → a transparent EIP-3009 authorization (visible once settled)
 *   - "unlink" → a private Unlink payment proof (no on-chain agent→seller edge)
 */
export interface PaywallConfig {
  resource: string;
  description: string;
  /** Seller address receiving an EIP-3009 (transparent) payment. */
  payTo: string;
  /** Seller's Unlink (bech32m) address for private payments. Optional. */
  payToUnlink?: string;
  /** ERC-20 asset (USDC test token). */
  asset: string;
  /** CAIP-2 network, e.g. "eip155:84532". */
  network: string;
  /** Price per call, in the asset's smallest unit (decimal string). */
  priceUnits: string;
  maxTimeoutSeconds?: number;
}

export type PaymentCheck =
  | { paid: true; via: "x402"; auth: Eip3009Authorization }
  | { paid: true; via: "unlink"; proof: UnlinkPaymentProof }
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

  /** Validate the X-PAYMENT header from the buyer's retry (either rail). */
  check(header: string | undefined, now: number = Math.floor(Date.now() / 1000)): PaymentCheck {
    if (!header) return { paid: false, reason: "missing X-PAYMENT header" };

    let raw: { scheme?: string };
    try {
      raw = decodeHeaderScheme(header);
    } catch {
      return { paid: false, reason: "malformed X-PAYMENT header" };
    }

    if (raw.scheme === "exact") return this.checkExact(header, now);
    if (raw.scheme === "unlink") return this.checkUnlink(raw as unknown as UnlinkPaymentProof);
    return { paid: false, reason: "unsupported scheme" };
  }

  private checkExact(header: string, now: number): PaymentCheck {
    const payload = decodePaymentHeader(header);
    if (payload.network !== this.cfg.network) return { paid: false, reason: "wrong network" };

    const a = payload.payload;
    if (!a?.signature) return { paid: false, reason: "missing signature" };
    if (a.to.toLowerCase() !== this.cfg.payTo.toLowerCase())
      return { paid: false, reason: "wrong recipient" };
    if (BigInt(a.value) < BigInt(this.cfg.priceUnits))
      return { paid: false, reason: "insufficient amount" };
    if (a.validBefore <= now) return { paid: false, reason: "authorization expired" };

    return { paid: true, via: "x402", auth: a };
  }

  private checkUnlink(proof: UnlinkPaymentProof): PaymentCheck {
    if (proof.network !== this.cfg.network) return { paid: false, reason: "wrong network" };
    if (!this.cfg.payToUnlink) return { paid: false, reason: "unlink payments not accepted" };
    if (proof.to !== this.cfg.payToUnlink) return { paid: false, reason: "wrong recipient" };
    if (!proof.txId) return { paid: false, reason: "missing tx id" };
    if (BigInt(proof.amount) < BigInt(this.cfg.priceUnits))
      return { paid: false, reason: "insufficient amount" };

    return { paid: true, via: "unlink", proof };
  }
}
