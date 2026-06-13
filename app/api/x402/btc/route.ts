import type { NextRequest } from "next/server";
import { withCircleGateway } from "@/src/circle/with-gateway";
import { btcSignalAt } from "@/src/oracle/feed";
import { ASSET, NETWORK, PRICE_UNITS, currentTick } from "@/src/oracle/oracle-config";

export const dynamic = "force-dynamic";

const RESOURCE = "/api/x402/btc";
const SELLER = (process.env.ORACLE_SELLER_ADDRESS ?? "").trim();

/** BTC trend signal paid for real via Circle Nanopayments (transparent rail). */
export const GET = withCircleGateway(
  {
    network: NETWORK,
    asset: ASSET,
    sellerAddress: SELLER,
    priceUnits: PRICE_UNITS,
    resource: RESOURCE,
    description: "BTC trend signal (Circle nanopayment)",
  },
  (req: NextRequest) => {
    const t = req.nextUrl.searchParams.get("tick");
    const tick = t !== null ? Number(t) : currentTick();
    return { resource: RESOURCE, tick, value: btcSignalAt(tick) };
  },
);
