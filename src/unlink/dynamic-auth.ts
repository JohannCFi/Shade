import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Verify a Dynamic session JWT against Dynamic's JWKS for our environment.
 * Returns the app user id (sub) when valid, or null otherwise.
 *
 * The browser obtains this token from Dynamic (getAuthToken) and sends it as
 * `Authorization: Bearer <jwt>` to the Unlink auth routes. This turns the
 * previously-stubbed authenticate into real per-user auth.
 *
 * NOTE: wired but not yet live-tested end-to-end (needs a real browser Dynamic
 * session to mint a token). Non-breaking: callers fall back when this returns null.
 */
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  const envId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
  if (!envId) return null;
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(
      new URL(`https://app.dynamic.xyz/api/v0/sdk/${envId}/.well-known/jwks`),
    );
  }
  return jwksCache;
}

export async function verifyDynamicToken(
  authorizationHeader: string | null,
): Promise<{ userId: string } | null> {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  const jwks = getJwks();
  if (!jwks) return null;
  try {
    const { payload } = await jwtVerify(token, jwks);
    const userId = typeof payload.sub === "string" ? payload.sub : undefined;
    return userId ? { userId } : null;
  } catch {
    return null;
  }
}
