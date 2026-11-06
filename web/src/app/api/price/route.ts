import { ok, getRoute } from "@/server/http";
import { getWifPrice } from "@/server/price";

// GET /api/price: public. {usd, source, fetchedAt}; usd is null if both price APIs fail.
export const GET = getRoute(async () => {
  return ok(await getWifPrice());
});
