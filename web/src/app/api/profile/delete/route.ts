import { requireCaller } from "@/server/auth";
import { deleteUserData } from "@/server/deletion";
import { ok, route } from "@/server/http";
import { enforceRateLimit } from "@/server/rateLimit";

// POST /api/profile/delete: auth. "Delete my profile": removes the profile (frees the @name), the
// avatar, every proof file from your wallets, and your reactions. Onchain records stay.
export const POST = route(async (request: Request) => {
  const caller = await requireCaller(request);
  await enforceRateLimit(`profile-delete:${caller.userId}`, 5, 3600, "Too many delete requests.");
  const result = await deleteUserData({ privyUserId: caller.userId, wallets: caller.wallets });
  return ok({ deleted: true, ...result });
});
