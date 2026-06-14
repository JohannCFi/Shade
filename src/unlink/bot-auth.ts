import { recoverMessageAddress } from "viem";
import { buildDeriveSeedMessage } from "@unlink-xyz/sdk/crypto";
import { account as unlinkAccount } from "@unlink-xyz/sdk/client";

/**
 * Stateless wallet-signature auth for external bots. A bot proves it owns its
 * Unlink address with two signatures from its EVM wallet — an identity proof
 * (the deterministic derive-seed signature, which maps to the Unlink address)
 * and a freshness proof (a timestamped message). The backend verifies both and
 * issues Unlink tokens only for the proven address. No admin key, no DB.
 */

/** Returns true only when `url` shares the exact origin and path-prefix of `apiUrl`. */
function isShadeApiUrl(url: string, apiUrl: string): boolean {
  try {
    const u = new URL(url);
    const a = new URL(apiUrl);
    return u.origin === a.origin && u.pathname.startsWith(a.pathname);
  } catch {
    return false;
  }
}

export const SHADE_AUTH_SCHEME = "ShadeSig";
export const DEFAULT_MAX_AGE_MS = 120_000;

export interface ShadeAuthPayload {
  deriveSig: `0x${string}`;
  unlinkAddress: string;
  ts: number;
  liveSig: `0x${string}`;
}

export interface MessageSigner {
  signMessage(args: { message: string }): Promise<`0x${string}`>;
}

export function deriveSeedMessage(appId: string, chainId: number): string {
  return buildDeriveSeedMessage({ appId, chainId });
}
export function liveMessage(unlinkAddress: string, ts: number): string {
  return `Shade-Auth:${unlinkAddress}:${ts}`;
}

export function encodeShadeAuth(payload: ShadeAuthPayload): string {
  return `${SHADE_AUTH_SCHEME} ${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
}

export function decodeShadeAuth(header: string | null): ShadeAuthPayload | null {
  if (!header?.startsWith(`${SHADE_AUTH_SCHEME} `)) return null;
  try {
    const json = Buffer.from(header.slice(SHADE_AUTH_SCHEME.length + 1), "base64").toString("utf8");
    const p = JSON.parse(json) as ShadeAuthPayload;
    if (typeof p?.deriveSig === "string" && typeof p?.unlinkAddress === "string" &&
        typeof p?.ts === "number" && Number.isFinite(p.ts) && typeof p?.liveSig === "string") return p;
    return null;
  } catch {
    return null;
  }
}

/** Build the proof header by signing with the bot's wallet. */
export async function buildShadeAuthHeader(
  signer: MessageSigner,
  opts: { appId: string; chainId: number; now?: number },
): Promise<string> {
  const deriveSig = await signer.signMessage({ message: deriveSeedMessage(opts.appId, opts.chainId) });
  const unlinkAddress = await unlinkAccount
    .fromEthereumSignature({ signature: deriveSig, appId: opts.appId, chainId: opts.chainId })
    .getAddress();
  const ts = opts.now ?? Date.now();
  const liveSig = await signer.signMessage({ message: liveMessage(unlinkAddress, ts) });
  return encodeShadeAuth({ deriveSig, unlinkAddress, ts, liveSig });
}

/** Verify a proof. Returns the proven Unlink address, or null if invalid. */
export async function verifyShadeAuth(
  payload: ShadeAuthPayload,
  opts: { appId: string; chainId: number; maxAgeMs?: number; now?: number },
): Promise<{ unlinkAddress: string } | null> {
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = opts.now ?? Date.now();
  const skewMs = 5_000;
  if (!Number.isFinite(payload.ts) || payload.ts - now > skewMs || now - payload.ts > maxAge) return null;

  let signer1: string;
  let derived: string;
  try {
    signer1 = await recoverMessageAddress({ message: deriveSeedMessage(opts.appId, opts.chainId), signature: payload.deriveSig });
    derived = await unlinkAccount.fromEthereumSignature({ signature: payload.deriveSig, appId: opts.appId, chainId: opts.chainId }).getAddress();
  } catch {
    return null;
  }
  if (derived !== payload.unlinkAddress) return null;

  let signer2: string;
  try {
    signer2 = await recoverMessageAddress({ message: liveMessage(payload.unlinkAddress, payload.ts), signature: payload.liveSig });
  } catch {
    return null;
  }
  if (!signer1 || !signer2) return null;
  if (signer1.toLowerCase() !== signer2.toLowerCase()) return null;

  return { unlinkAddress: payload.unlinkAddress };
}

/**
 * A `fetch` wrapper that attaches a freshly-built auth header to requests aimed
 * at `apiUrl` (the Shade backend) and passes every other request (e.g. the Unlink
 * Engine) through untouched.
 */
export function makeAuthInjectingFetch(
  apiUrl: string,
  authHeader: () => Promise<string>,
  baseFetch: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (isShadeApiUrl(url, apiUrl)) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set("Authorization", await authHeader());
      return baseFetch(input, { ...init, headers });
    }
    return baseFetch(input, init);
  }) as typeof globalThis.fetch;
}
