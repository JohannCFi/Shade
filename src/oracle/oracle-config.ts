/**
 * Shared config for the mocked x402 oracle endpoints. Safe to import from Next
 * route handlers — reads env directly with fallbacks (does NOT import the strict
 * Unlink config, which throws on missing secrets).
 */
import { resolveChain } from "../chain/chains.js";

const chain = resolveChain(process.env.UNLINK_ENVIRONMENT);

/** CAIP-2 id of the active chain (Arc Testnet by default). */
export const NETWORK = chain.caip2;

/** ERC-20 asset paid per call. Defaults to Arc USDC. */
export const ASSET =
  process.env.UNLINK_TEST_TOKEN?.trim() ||
  "0x3600000000000000000000000000000000000000";

const TOKEN_DECIMALS = Number(process.env.UNLINK_TOKEN_DECIMALS ?? "6");

/** Price per oracle call (0.001 token) in the asset's smallest unit. */
export const PRICE_UNITS = (10n ** BigInt(Math.max(TOKEN_DECIMALS - 3, 0))).toString();

/** Distinct (valid) seller addresses, so the spy can tell the oracles apart. */
export const ETH_ORACLE_PAYTO = "0x1111111111111111111111111111111111111111";
export const BTC_ORACLE_PAYTO = "0x2222222222222222222222222222222222222222";

/**
 * Stateless routes derive a tick from wall-clock time (one new quote per
 * `TICK_SECONDS`). Callers may override with `?tick=` for determinism.
 */
export const TICK_SECONDS = 5;

export function currentTick(now: number = Date.now()): number {
  return Math.floor(now / 1000 / TICK_SECONDS);
}
