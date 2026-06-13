import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";
import { TransparentChannel } from "../src/payment/transparent-channel.js";
import { Paywall } from "../src/oracle/paywall.js";
import { decodePaymentHeader } from "../src/x402/types.js";
import {
  TRANSFER_WITH_AUTHORIZATION_TYPES,
} from "../src/payment/eip3009.js";
import type { PaymentRequirements } from "../src/x402/types.js";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // anvil #1
const ASSET = "0x7501de8ea37a21e20e6e65947d2ecab0e9f061a7";
const PAYTO = "0x1111111111111111111111111111111111111111";
const NETWORK = "eip155:84532";
const PRICE = "1000000000000000";

const req: PaymentRequirements = {
  scheme: "exact",
  network: NETWORK,
  maxAmountRequired: PRICE,
  resource: "GET /api/oracle/eth",
  description: "ETH price",
  mimeType: "application/json",
  payTo: PAYTO,
  maxTimeoutSeconds: 300,
  asset: ASSET,
};

describe("TransparentChannel (real EIP-3009)", () => {
  it("produces an X-PAYMENT header whose signature recovers to the agent", async () => {
    const account = privateKeyToAccount(PK);
    const channel = new TransparentChannel({ account, tokenName: "ULNK Mock", tokenVersion: "1" });

    const receipt = await channel.pay(req);
    const payload = decodePaymentHeader(receipt.header).payload;

    const recovered = await recoverTypedDataAddress({
      domain: { name: "ULNK Mock", version: "1", chainId: 84532, verifyingContract: ASSET },
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: payload.from as `0x${string}`,
        to: payload.to as `0x${string}`,
        value: BigInt(payload.value),
        validAfter: BigInt(payload.validAfter),
        validBefore: BigInt(payload.validBefore),
        nonce: payload.nonce as `0x${string}`,
      },
      signature: payload.signature as `0x${string}`,
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("is accepted by the oracle paywall and is observable to the spy", async () => {
    const account = privateKeyToAccount(PK);
    const channel = new TransparentChannel({ account, tokenName: "ULNK Mock", tokenVersion: "1" });
    const paywall = new Paywall({
      resource: req.resource, description: req.description, payTo: PAYTO,
      asset: ASSET, network: NETWORK, priceUnits: PRICE,
    });

    const receipt = await channel.pay(req);
    expect(paywall.check(receipt.header).paid).toBe(true);
    expect(receipt.observable).toEqual({ from: account.address, to: PAYTO, amount: PRICE });
    expect(channel.totalSpent()).toBe(BigInt(PRICE));
  });
});
