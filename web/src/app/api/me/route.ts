import { requireCaller } from "@/server/auth";
import { ok, getRoute } from "@/server/http";
import { groupsForWallet, type ProfileRow } from "@/server/queries";
import { statsFor } from "@/server/stats";
import { check, db } from "@/server/supabase";

// GET /api/me: auth. Your profile (null until you pick an @name) and your groups.
export const GET = getRoute(async (request: Request) => {
  const caller = await requireCaller(request);
  const [rows, groups, stats] = await Promise.all([
    db().from("profiles").select("*").eq("privy_user_id", caller.userId).limit(1),
    groupsForWallet(caller.wallet),
    statsFor(caller.wallet),
  ]);
  const p = (check(rows, "loading profile") as ProfileRow[])[0];
  return ok({
    wallet: caller.wallet,
    wallets: caller.wallets,
    profile: p
      ? { wallet: p.wallet_address, username: p.username, avatarUrl: p.avatar_url, ringColor: p.ring_color, ageConfirmed: !!p.age_confirmed_at, streak: stats.currentStreak }
      : null,
    stats,
    groups,
  });
});
