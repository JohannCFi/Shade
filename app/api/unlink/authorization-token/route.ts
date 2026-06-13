import { getUnlinkAuthRoutes } from "@/src/unlink/auth-routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Browser Unlink client fetches short-lived authorization tokens here (POST). */
export async function POST(request: Request): Promise<Response> {
  return getUnlinkAuthRoutes().authorizationToken(request);
}
