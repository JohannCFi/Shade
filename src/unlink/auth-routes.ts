import {
  createUnlinkAdmin,
  createUnlinkAuthRoutes,
  type UnlinkAuthRouteHandlers,
} from "@unlink-xyz/sdk/admin";
import { resolveChain } from "../chain/chains.js";
import { UNLINK_APP_ID } from "./app-id.js";
import { SHADE_AUTH_SCHEME, decodeShadeAuth, verifyShadeAuth } from "./bot-auth.js";
import { verifyDynamicToken } from "./dynamic-auth.js";

/**
 * Server-only Unlink auth routes for the browser flow.
 *
 * The owner connects via Dynamic in the browser; the browser Unlink client then
 * needs two backend routes (register + short-lived authorization tokens) that
 * hold the admin API key. This builds them once, lazily.
 */
export interface ShadeSession {
  userId: string;
  /** Set when the caller authenticated with a ShadeSig wallet proof (a bot). */
  unlinkAddress?: string;
}

/**
 * Resolve the app session for an Unlink auth route request:
 *  1. a ShadeSig wallet proof (external bot) → session bound to the proven address;
 *  2. else a Dynamic session JWT;
 *  3. else the demo fallback (browser today). PROD could reject here instead.
 */
export async function authenticateShadeRequest(request: Request, chainId: number): Promise<ShadeSession> {
  const authz = request.headers.get("authorization");
  const isShadeScheme = authz?.startsWith(`${SHADE_AUTH_SCHEME} `) ?? false;
  const proof = decodeShadeAuth(authz);
  if (isShadeScheme) {
    if (!proof) throw new Error("malformed Shade auth header");
    const v = await verifyShadeAuth(proof, { appId: UNLINK_APP_ID, chainId });
    if (!v) throw new Error("invalid Shade auth proof");
    return { userId: v.unlinkAddress, unlinkAddress: v.unlinkAddress };
  }
  const verified = await verifyDynamicToken(authz);
  if (verified) return verified;
  return { userId: request.headers.get("x-shade-user") ?? "demo-user" };
}

/** A bot session may only receive tokens for its own address; others unchanged. */
export function authorizeShade(session: ShadeSession, unlinkAddress: string): boolean {
  return session.unlinkAddress
    ? session.unlinkAddress.toLowerCase() === unlinkAddress.toLowerCase()
    : true;
}

let cached: UnlinkAuthRouteHandlers | null = null;

export function getUnlinkAuthRoutes() {
  if (cached) return cached;

  const apiKey = process.env.UNLINK_API_KEY;
  if (!apiKey) throw new Error("UNLINK_API_KEY is not set");

  const admin = createUnlinkAdmin({
    environment: process.env.UNLINK_ENVIRONMENT ?? "arc-testnet",
    apiKey,
  });

  const chainId = resolveChain(process.env.UNLINK_ENVIRONMENT ?? "arc-testnet").chainId;

  cached = createUnlinkAuthRoutes<ShadeSession>({
    admin,
    authenticate: (request) => authenticateShadeRequest(request, chainId),
    onRegister: async () => {
      // TODO(future): persist app-user -> unlink-address mapping.
    },
    authorizeUnlinkAddress: async ({ session, unlinkAddress }) => authorizeShade(session, unlinkAddress),
  });
  return cached;
}
