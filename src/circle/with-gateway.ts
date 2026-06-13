import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Circle Gateway (Nanopayments) seller-side wrapper for Next.js App Router.
 *
 * Adapted from circlefin/arc-nanopayments `lib/x402.ts` (Apache-2.0), minus the
 * Supabase persistence: wraps a route handler so each call is paid via Circle's
 * batched x402 settlement. The facilitator verifies the EIP-3009 authorization
 * (signed against the GatewayWallet) and settles it gaslessly in batches.
 */

// The default facilitator is MAINNET (gateway-api.circle.com) and only knows
// mainnet networks. For Arc Testnet / Base Sepolia we must use the testnet
// facilitator, which advertises the GatewayWallet for eip155:5042002 et al.
const FACILITATOR_URL =
  process.env.CIRCLE_FACILITATOR_URL?.trim() || "https://gateway-api-testnet.circle.com";
const facilitator = new BatchFacilitatorClient({ url: FACILITATOR_URL });

/** Circle's batching EIP-712 domain name/version (constant across networks). */
const BATCH_NAME = "GatewayWalletBatched";
const BATCH_VERSION = "1";

interface CirclePaymentPayload {
  x402Version: number;
  resource?: { url: string; description: string; mimeType: string };
  accepted?: Record<string, unknown>;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

let verifyingContractCache: Record<string, string> = {};

/** Resolve the GatewayWallet verifyingContract for a network (cached). */
async function verifyingContractFor(network: string): Promise<string> {
  if (verifyingContractCache[network]) return verifyingContractCache[network];
  const supported = await facilitator.getSupported();
  for (const kind of supported.kinds) {
    const vc = (kind.extra as { verifyingContract?: string } | undefined)?.verifyingContract;
    if (kind.network && vc) verifyingContractCache[kind.network] = vc;
  }
  const found = verifyingContractCache[network];
  if (!found) {
    throw new Error(
      `Circle facilitator does not advertise a GatewayWallet for ${network}. ` +
        `Supported: ${supported.kinds.map((k) => k.network).join(", ")}`,
    );
  }
  return found;
}

export interface CircleResource {
  /** CAIP-2 network, e.g. "eip155:5042002" (Arc Testnet). */
  network: string;
  /** USDC asset address. */
  asset: string;
  /** Seller address receiving payment. */
  sellerAddress: string;
  /** Price per call in USDC atomic units (6 decimals), decimal string. */
  priceUnits: string;
  /** Resource id, e.g. "/api/x402/eth". */
  resource: string;
  description?: string;
}

async function buildRequirements(cfg: CircleResource) {
  return {
    scheme: "exact" as const,
    network: cfg.network,
    asset: cfg.asset,
    amount: cfg.priceUnits,
    payTo: cfg.sellerAddress,
    maxTimeoutSeconds: 345600,
    extra: {
      name: BATCH_NAME,
      version: BATCH_VERSION,
      verifyingContract: await verifyingContractFor(cfg.network),
    },
  };
}

/**
 * Wrap a Next route handler with Circle Gateway payment.
 * `dataFn` produces the paid response body once payment settles.
 */
export function withCircleGateway(
  cfg: CircleResource,
  dataFn: (req: NextRequest) => Promise<unknown> | unknown,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const requirements = await buildRequirements(cfg);
    const paymentSignature = req.headers.get("payment-signature");

    if (!paymentSignature) {
      const paymentRequired = {
        x402Version: 2,
        resource: {
          url: cfg.resource,
          description: cfg.description ?? `Paid resource`,
          mimeType: "application/json",
        },
        accepts: [requirements],
      };
      return new NextResponse(JSON.stringify({}), {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(paymentRequired)).toString("base64"),
        },
      });
    }

    try {
      const paymentPayload: CirclePaymentPayload = JSON.parse(
        Buffer.from(paymentSignature, "base64").toString("utf-8"),
      );

      const verifyResult = await facilitator.verify(paymentPayload, requirements);
      if (!verifyResult.isValid) {
        return NextResponse.json(
          { error: "verification failed", reason: verifyResult.invalidReason },
          { status: 402 },
        );
      }

      const settleResult = await facilitator.settle(paymentPayload, requirements);
      if (!settleResult.success) {
        return NextResponse.json(
          { error: "settlement failed", reason: settleResult.errorReason },
          { status: 402 },
        );
      }

      const payer = settleResult.payer ?? verifyResult.payer ?? "unknown";
      const body = await dataFn(req);
      const response = NextResponse.json(body);
      response.headers.set(
        "PAYMENT-RESPONSE",
        Buffer.from(
          JSON.stringify({
            success: true,
            transaction: settleResult.transaction,
            network: settleResult.network,
            payer,
          }),
        ).toString("base64"),
      );
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: "payment processing error", message }, { status: 500 });
    }
  };
}
