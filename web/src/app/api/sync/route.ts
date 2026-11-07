import { clientIp, ok, getRoute } from "@/server/http";
import { enforceRouteLimit } from "@/server/rateLimit";
import { sync } from "@/server/sync";

// GET /api/sync: public. Pulls new escrow events into Supabase. Throttled server-side: if the
// last sync finished under 3 s ago this returns {status: "throttled"} without touching the chain.
// Rate limited per IP (M-6): open tabs call it every 20 s.
export const GET = getRoute(async (request: Request) => {
  await enforceRouteLimit("sync", clientIp(request), null, 30);
  return ok(await sync());
});
