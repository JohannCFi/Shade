"use client";

import {
  account as unlinkAccount,
  createUnlinkClient,
  evm,
  type UnlinkClient,
  type ViemWalletClientLike,
  type ViemPublicClientLike,
} from "@unlink-xyz/sdk/browser";
import { buildDeriveSeedMessage } from "@unlink-xyz/sdk/crypto";
import { resolveChain } from "../chain/chains.js";

/** Minimal structural shape of a Dynamic EVM wallet (what we use). */
export interface DynamicEvmWallet {
  signMessage(message: string): Promise<string | undefined>;
  getWalletClient(): Promise<unknown>;
  getPublicClient(): Promise<unknown>;
}

/** App id bound into the Unlink identity derivation (keep stable). */
export const UNLINK_APP_ID = "shade";

/** Browser-safe config (NEXT_PUBLIC only — never import the strict server config here). */
export const BROWSER_ENV = process.env.NEXT_PUBLIC_UNLINK_ENVIRONMENT ?? "arc-testnet";
export const BROWSER_TOKEN =
  process.env.NEXT_PUBLIC_UNLINK_TOKEN ?? "0x3600000000000000000000000000000000000000";
export const BROWSER_TOKEN_DECIMALS = Number(
  process.env.NEXT_PUBLIC_UNLINK_TOKEN_DECIMALS ?? "6",
);

/**
 * Build a browser Unlink client driven by the owner's Dynamic wallet.
 *
 * The Dynamic wallet signs the canonical derivation message → an Unlink identity
 * (`fromEthereumSignature`); its viem clients back the on-chain ops
 * (deposit/withdraw). Registration + authorization tokens go through the app's
 * own backend routes (defaults: /api/unlink/register, /api/unlink/authorization-token).
 */
export async function createBrowserUnlinkClient(
  wallet: DynamicEvmWallet,
): Promise<UnlinkClient> {
  const chain = resolveChain(BROWSER_ENV);

  const message = buildDeriveSeedMessage({ appId: UNLINK_APP_ID, chainId: chain.chainId });
  const signature = await wallet.signMessage(message);
  if (!signature) throw new Error("wallet did not return a signature");

  const account = unlinkAccount.fromEthereumSignature({
    signature,
    appId: UNLINK_APP_ID,
    chainId: chain.chainId,
  });

  const walletClient = await wallet.getWalletClient();
  const publicClient = await wallet.getPublicClient();
  const evmProvider = evm.fromViem({
    walletClient: walletClient as unknown as ViemWalletClientLike,
    publicClient: publicClient as unknown as ViemPublicClientLike,
  });

  return createUnlinkClient({
    environment: BROWSER_ENV,
    account,
    evm: evmProvider,
  });
}

/** Format base units (token decimals) to a human string. */
export function fmtToken(amount: string, decimals = BROWSER_TOKEN_DECIMALS): string {
  const padded = amount.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/** Human amount (e.g. "5") → base units string. */
export function toToken(amount: string, decimals = BROWSER_TOKEN_DECIMALS): string {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return `${whole}${fracPadded}`.replace(/^0+(?=\d)/, "") || "0";
}
