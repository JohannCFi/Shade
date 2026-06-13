/**
 * Shared config for the mocked x402 oracle endpoints. Safe to import from Next
 * route handlers — reads env directly with fallbacks (does NOT import the strict
 * Unlink config, which throws on missing secrets).
 */

/** CAIP-2 id for base-sepolia. */
export const NETWORK = "eip155:84532";

/** ERC-20 asset paid per call (the ULNKm test token), with a demo fallback. */
export const ASSET =
  process.env.UNLINK_TEST_TOKEN?.trim() ||
  "0x7501de8ea37a21e20e6e65947d2ecab0e9f061a7";

/** Price per oracle call, in the asset's smallest unit (0.001 token @ 18 dec). */
export const PRICE_UNITS = "1000000000000000";

/** Distinct seller addresses, so the spy can tell the two oracles apart. */
export const ETH_ORACLE_PAYTO = "0xE7100rac1e0000000000000000000000000000a1";
export const BTC_ORACLE_PAYTO = "0xB7c510Na100000000000000000000000000000a2";

/**
 * Stateless routes derive a tick from wall-clock time (one new quote per
 * `TICK_SECONDS`). Callers may override with `?tick=` for determinism.
 */
export const TICK_SECONDS = 5;

export function currentTick(now: number = Date.now()): number {
  return Math.floor(now / 1000 / TICK_SECONDS);
}
