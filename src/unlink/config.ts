import "dotenv/config";
import { resolveChain } from "../chain/chains.js";
import { fromBaseUnits as fmt, toBaseUnits as toBase } from "./units.js";

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

const environment = optional("UNLINK_ENVIRONMENT", "arc-testnet");
const chain = resolveChain(environment);

export const config = {
  /** Unlink hosted environment (resolves to the Engine URL). */
  environment,
  /** Resolved chain info (viem chain, chainId, CAIP-2, Circle chain name). */
  chain,
  /** Server-side admin API key (dashboard.unlink.xyz project settings). */
  apiKey: required("UNLINK_API_KEY"),
  /** ERC-20 test token address configured for the environment. */
  testToken: required("UNLINK_TEST_TOKEN"),
  /** Decimals of the test token (USDC = 6, base-sepolia ULNKm = 18). */
  tokenDecimals: Number(optional("UNLINK_TOKEN_DECIMALS", "6")),
  /** BIP-39 mnemonic — derives BOTH the Unlink account and the EVM wallet. */
  mnemonic: required("WALLET_MNEMONIC"),
  /** Optional EVM private key override (used only for the onchain wallet). */
  privateKey: process.env.WALLET_PRIVATE_KEY?.trim() || undefined,
  /** RPC endpoint (RPC_URL override, else the chain's default). */
  rpcUrl: process.env.RPC_URL?.trim() || optional("BASE_SEPOLIA_RPC", chain.defaultRpc),
} as const;

/** Convert a human amount (e.g. "0.25") to base units as a decimal string. */
export const toBaseUnits = (amount: string, decimals = config.tokenDecimals): string =>
  toBase(amount, decimals);

/** Format base units back to a human-readable decimal string. */
export const fromBaseUnits = (amount: string, decimals = config.tokenDecimals): string =>
  fmt(amount, decimals);
