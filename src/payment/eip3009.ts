import { type Address, type Hex } from "viem";

/**
 * EIP-3009 `transferWithAuthorization` typed-data helpers. This is the
 * authorization an x402 buyer signs off-chain (zero gas); a facilitator
 * (Circle Nanopayments, étape 2d) later settles it on-chain in batches.
 */

export interface TransferAuthorizationMessage {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex; // 32-byte
}

export interface Eip712TokenDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/** Build the full typed-data payload for signing / verifying. */
export function buildTransferAuthorizationTypedData(
  domain: Eip712TokenDomain,
  message: TransferAuthorizationMessage,
) {
  return {
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization" as const,
    message,
  };
}

/** A random 32-byte nonce as 0x-hex (uses Web Crypto, available in Node 22). */
export function randomNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")) as Hex;
}
