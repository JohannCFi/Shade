import {
  createUnlinkAdmin,
  createUnlinkAuthRoutes,
  type UnlinkAuthRouteHandlers,
} from "@unlink-xyz/sdk/admin";

/**
 * Server-only Unlink auth routes for the browser flow.
 *
 * The owner connects via Dynamic in the browser; the browser Unlink client then
 * needs two backend routes (register + short-lived authorization tokens) that
 * hold the admin API key. This builds them once, lazily.
 *
 * NOTE (étape 3): `authenticate` / `authorizeUnlinkAddress` are stubbed for now
 * — wire them to the Dynamic session (verify the Dynamic JWT) when the front
 * onboarding is built. The plumbing (admin + route handlers) is ready.
 */
export interface ShadeSession {
  userId: string;
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

  cached = createUnlinkAuthRoutes<ShadeSession>({
    admin,
    authenticate: async (request) => {
      // TODO(étape 3): verify the Dynamic session JWT from the Authorization
      // header and resolve the real app user. Stubbed for scaffolding.
      const userId = request.headers.get("x-shade-user") ?? "demo-user";
      return { userId };
    },
    onRegister: async () => {
      // TODO(étape 3): persist app-user -> unlink-address mapping.
    },
    authorizeUnlinkAddress: async () => true, // TODO(étape 3): check ownership
  });
  return cached;
}
