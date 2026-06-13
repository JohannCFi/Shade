import { Paywall } from "@/src/oracle/paywall";
import { ethPriceAt } from "@/src/oracle/feed";
import { handleOracleRequest } from "@/src/oracle/route-helper";
import { ASSET, ETH_ORACLE_PAYTO, NETWORK, PRICE_UNITS } from "@/src/oracle/oracle-config";

export const dynamic = "force-dynamic";

const RESOURCE = "GET /api/oracle/eth";

const paywall = new Paywall({
  resource: RESOURCE,
  description: "ETH spot price (pay-per-call)",
  payTo: ETH_ORACLE_PAYTO,
  asset: ASSET,
  network: NETWORK,
  priceUnits: PRICE_UNITS,
});

export function GET(request: Request): Response {
  return handleOracleRequest(request, paywall, ethPriceAt, RESOURCE);
}
