import "dotenv/config";

/**
 * Centralised, validated configuration for the Unlink integration.
 * Throws early with a clear message if a required secret is missing, so the
 * derisk spike fails fast instead of deep inside the SDK.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

export const config = {
  /** Unlink hosted environment (resolves to the Engine URL). */
  environment: optional("UNLINK_ENVIRONMENT", "base-sepolia"),
  /** Server-side admin API key (dashboard.unlink.xyz project settings). */
  apiKey: required("UNLINK_API_KEY"),
  /** ERC-20 test token address configured for the environment. */
  testToken: required("UNLINK_TEST_TOKEN"),
  /** Decimals of the test token (USDC test = 6). */
  tokenDecimals: Number(optional("UNLINK_TOKEN_DECIMALS", "6")),
  /** BIP-39 mnemonic — derives BOTH the Unlink account and the EVM wallet. */
  mnemonic: required("WALLET_MNEMONIC"),
  /** Optional EVM private key override (used only for the onchain wallet). */
  privateKey: process.env.WALLET_PRIVATE_KEY?.trim() || undefined,
  /** base-sepolia RPC endpoint. */
  rpcUrl: optional("BASE_SEPOLIA_RPC", "https://sepolia.base.org"),
} as const;

/** Convert a human amount (e.g. "0.25") to base units as a decimal string. */
export function toBaseUnits(amount: string, decimals = config.tokenDecimals): string {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const combined = `${whole}${fracPadded}`.replace(/^0+(?=\d)/, "");
  return combined === "" ? "0" : combined;
}

/** Format base units back to a human-readable decimal string. */
export function fromBaseUnits(amount: string, decimals = config.tokenDecimals): string {
  const padded = amount.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
