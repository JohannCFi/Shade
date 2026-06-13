import { getUnlinkAuthRoutes } from "@/src/unlink/auth-routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Browser Unlink client registers the user here (POST). */
export async function POST(request: Request): Promise<Response> {
  return getUnlinkAuthRoutes().register(request);
}
