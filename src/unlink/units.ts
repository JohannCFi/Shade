/**
 * Pure, side-effect-free token unit formatters.
 * No imports, no dotenv, no env-var reads — safe to import from any context
 * (browser, server route, test) without triggering config validation.
 *
 * The default decimals (6) matches USDC / the project's UNLINK_TOKEN_DECIMALS
 * default. Callers that need a different precision pass it explicitly.
 */

/** Convert a human amount (e.g. "0.25") to base units as a decimal string. */
export function toBaseUnits(amount: string, decimals = 6): string {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const combined = `${whole}${fracPadded}`.replace(/^0+(?=\d)/, "");
  return combined === "" ? "0" : combined;
}

/** Format base units back to a human-readable decimal string. */
export function fromBaseUnits(amount: string, decimals = 6): string {
  const padded = amount.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
