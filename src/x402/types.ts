/**
 * Minimal x402 v2 wire types (the "exact" EVM scheme), enough for our mocked
 * oracle paywall and the agent buyer. See https://x402.gitbook.io/x402.
 */

/** Header carrying the base64-encoded PaymentPayload on the retry request. */
export const X_PAYMENT_HEADER = "x-payment";
export const X402_VERSION = "2.0.0";

/** One accepted way to pay, advertised in the 402 response. */
export interface PaymentRequirements {
  scheme: "exact";
  /** CAIP-2 network id, e.g. "eip155:84532" for base-sepolia. */
  network: string;
  /** Amount in the asset's smallest unit, as a decimal string. */
  maxAmountRequired: string;
  /** The resource being paid for, e.g. "GET /oracle/eth". */
  resource: string;
  description: string;
  mimeType: string;
  /** Seller address that receives the payment. */
  payTo: string;
  maxTimeoutSeconds: number;
  /** ERC-20 asset address (USDC test token on base-sepolia). */
  asset: string;
  extra?: Record<string, unknown>;
}

/** Body of a 402 Payment Required response. */
export interface PaymentRequiredBody {
  x402Version: string;
  accepts: PaymentRequirements[];
}

/** EIP-3009 transferWithAuthorization fields the buyer signs. */
export interface Eip3009Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: number;
  validBefore: number;
  /** 32-byte hex nonce. */
  nonce: string;
  /** 0x-prefixed signature over the EIP-3009 typed data. */
  signature: string;
}

/** Decoded contents of the X-PAYMENT header. */
export interface PaymentPayload {
  x402Version: string;
  scheme: "exact";
  network: string;
  payload: Eip3009Authorization;
}

export function encodePaymentHeader(payload: PaymentPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decodePaymentHeader(header: string): PaymentPayload {
  const json = Buffer.from(header, "base64").toString("utf8");
  return JSON.parse(json) as PaymentPayload;
}
