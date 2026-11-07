import { requireCaller } from "@/server/auth";
import { crewAccess } from "@/server/access";
import { ApiError, getRoute, ok } from "@/server/http";
import { profilesByWallet, toPublic } from "@/server/queries";
import { leaderboard } from "@/server/score";
import { scoreSnapshot } from "@/server/stats";
import { check, db } from "@/server/supabase";
import { idSchema } from "@/server/validation";

// GET /api/groups/<id>/leaderboard?period=week|all: members only. Points earned in this wifie,
// highest first; members with no points yet are listed after (0).
export const GET = getRoute(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const caller = await requireCaller(request);
  const groupId = Number(idSchema.parse((await ctx.params).id));
  const period = new URL(request.url).searchParams.get("period") === "week" ? "week" : "all";
  const access = await crewAccess(groupId, caller.wallet);
  if (!access.member) throw new ApiError(403, "You are not in this wifie.");

  const [{ events }, membersRes] = await Promise.all([scoreSnapshot(), db().from("group_members").select("wallet_address").eq("group_id", groupId)]);
  const members = (check(membersRes, "loading members") as Array<{ wallet_address: string }>).map((m) => m.wallet_address);
  const ranked = leaderboard(events, groupId, period, Date.now()).filter((r) => members.includes(r.wallet));
  const rest = members.filter((m) => !ranked.some((r) => r.wallet === m)).map((wallet) => ({ wallet, points: 0 }));
  const rows = [...ranked, ...rest];
  const profiles = await profilesByWallet(rows.map((r) => r.wallet));
  return ok({ period, rows: rows.map((r, i) => ({ rank: i + 1, points: r.points, person: toPublic(r.wallet, profiles.get(r.wallet)) })) });
});
