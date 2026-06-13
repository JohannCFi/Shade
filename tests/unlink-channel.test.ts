import { describe, it, expect, vi } from "vitest";
import { UnlinkChannel, type UnlinkPrivatePayer } from "../src/payment/unlink-channel.js";
import { Paywall } from "../src/oracle/paywall.js";
import type { PaymentRequirements } from "../src/x402/types.js";

const ASSET = "0x7501de8ea37a21e20e6e65947d2ecab0e9f061a7";
const PAYTO = "0x1111111111111111111111111111111111111111";
const SELLER_UNLINK = "unlink1qqseller0000000000000000000000000000000000000000000000000000";
const NETWORK = "eip155:84532";
const PRICE = "1000000000000000";

const req: PaymentRequirements = {
  scheme: "exact", network: NETWORK, maxAmountRequired: PRICE,
  resource: "GET /api/oracle/eth", description: "ETH price",
  mimeType: "application/json", payTo: PAYTO, maxTimeoutSeconds: 300, asset: ASSET,
};

function fakePayer(status = "processed") {
  const transfer = vi.fn(async () => ({ wait: async () => ({ status }) }));
  return { payer: { transfer } as UnlinkPrivatePayer, transfer };
}

function paywall() {
  return new Paywall({
    resource: req.resource, description: req.description, payTo: PAYTO,
    payToUnlink: SELLER_UNLINK, asset: ASSET, network: NETWORK, priceUnits: PRICE,
  });
}

describe("UnlinkChannel (private payment)", () => {
  it("pays the seller's Unlink address privately and leaks nothing", async () => {
    const { payer, transfer } = fakePayer();
    const channel = new UnlinkChannel({
      payer,
      resolveSellerUnlinkAddress: () => SELLER_UNLINK,
    });

    const receipt = await channel.pay(req);

    expect(transfer).toHaveBeenCalledWith({
      token: ASSET,
      amount: PRICE,
      recipientAddress: SELLER_UNLINK,
    });
    expect(receipt.observable).toBeNull();
    expect(channel.payerLabel).toBe("shielded");
    expect(channel.totalSpent()).toBe(BigInt(PRICE));
  });

  it("produces a header the (Unlink-aware) oracle paywall accepts", async () => {
    const { payer } = fakePayer();
    const channel = new UnlinkChannel({ payer, resolveSellerUnlinkAddress: () => SELLER_UNLINK });

    const receipt = await channel.pay(req);
    const check = paywall().check(receipt.header);
    expect(check.paid).toBe(true);
    if (check.paid) expect(check.via).toBe("unlink");
  });

  it("throws if the private transfer is not processed", async () => {
    const { payer } = fakePayer("failed");
    const channel = new UnlinkChannel({ payer, resolveSellerUnlinkAddress: () => SELLER_UNLINK });
    await expect(channel.pay(req)).rejects.toThrow(/not processed/);
  });

  it("an EIP-3009 paywall (no Unlink configured) rejects an Unlink proof", async () => {
    const { payer } = fakePayer();
    const channel = new UnlinkChannel({ payer, resolveSellerUnlinkAddress: () => SELLER_UNLINK });
    const receipt = await channel.pay(req);

    const transparentOnly = new Paywall({
      resource: req.resource, description: req.description, payTo: PAYTO,
      asset: ASSET, network: NETWORK, priceUnits: PRICE, // no payToUnlink
    });
    expect(transparentOnly.check(receipt.header).paid).toBe(false);
  });
});
