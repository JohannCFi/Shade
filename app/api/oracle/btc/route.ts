import { Paywall } from "@/src/oracle/paywall";
import { btcSignalAt } from "@/src/oracle/feed";
import { handleOracleRequest } from "@/src/oracle/route-helper";
import { ASSET, BTC_ORACLE_PAYTO, NETWORK, PRICE_UNITS } from "@/src/oracle/oracle-config";

export const dynamic = "force-dynamic";

const RESOURCE = "GET /api/oracle/btc";

const paywall = new Paywall({
  resource: RESOURCE,
  description: "BTC trend signal (pay-per-call)",
  payTo: BTC_ORACLE_PAYTO,
  asset: ASSET,
  network: NETWORK,
  priceUnits: PRICE_UNITS,
});

export function GET(request: Request): Response {
  return handleOracleRequest(request, paywall, btcSignalAt, RESOURCE);
}
