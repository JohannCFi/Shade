import type { NextRequest } from "next/server";
import { withCircleGateway } from "@/src/circle/with-gateway";
import { ethPriceAt } from "@/src/oracle/feed";
import { ASSET, NETWORK, PRICE_UNITS, currentTick } from "@/src/oracle/oracle-config";

export const dynamic = "force-dynamic";

const RESOURCE = "/api/x402/eth";
const SELLER = (process.env.ORACLE_SELLER_ADDRESS ?? "").trim();

/**
 * ETH price oracle paid for real via Circle Nanopayments (Gateway batching).
 * The transparent ("x402 nu") rail: the agent's Circle Gateway balance settles
 * each call on-chain — fully visible to anyone reading the chain.
 */
export const GET = withCircleGateway(
  {
    network: NETWORK,
    asset: ASSET,
    sellerAddress: SELLER,
    priceUnits: PRICE_UNITS,
    resource: RESOURCE,
    description: "ETH spot price (Circle nanopayment)",
  },
  (req: NextRequest) => {
    const t = req.nextUrl.searchParams.get("tick");
    const tick = t !== null ? Number(t) : currentTick();
    return { resource: RESOURCE, tick, value: ethPriceAt(tick) };
  },
);
