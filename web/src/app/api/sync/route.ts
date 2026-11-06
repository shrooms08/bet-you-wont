import { ok, getRoute } from "@/server/http";
import { sync } from "@/server/sync";

// GET /api/sync: public. Pulls new escrow events into Supabase. Throttled server-side: if the
// last sync finished under 3 s ago this returns {status: "throttled"} without touching the chain.
export const GET = getRoute(async () => {
  return ok(await sync());
});
