import { getGroupOnchain, groupExists } from "@/server/chain";
import { ApiError, clientIp, getRoute, ok } from "@/server/http";
import { profilesByWallet, toPublic, type GroupRow } from "@/server/queries";
import { enforceRateLimit } from "@/server/rateLimit";
import { check, db } from "@/server/supabase";
import { idSchema } from "@/server/validation";

// GET /api/groups/<id>/public: public, 60/min/IP. Preview of a PUBLIC group for people who
// haven't joined (onboarding's "join the world is flat crowd" card). Private groups -> 404.
export const GET = getRoute(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  await enforceRateLimit(`public-group:${clientIp(request)}`, 60, 60, "Too many lookups.");
  const groupId = idSchema.parse((await ctx.params).id);
  const id = groupId.toString();

  const row = (check(await db().from("groups").select("*").eq("id", id).limit(1), "loading group") as GroupRow[])[0];
  const isPublic = row ? row.is_public : await getGroupOnchain(groupId).then((g) => groupExists(g) && g.isPublic);
  if (!isPublic) throw new ApiError(404, "No public group with that id.");

  const [members, open, voting] = await Promise.all([
    db().from("group_members").select("wallet_address").eq("group_id", id).order("joined_at", { ascending: false }).limit(500),
    db().from("dares").select("*", { count: "exact", head: true }).eq("group_id", id).eq("state", "Open"),
    db().from("dares").select("*", { count: "exact", head: true }).eq("group_id", id).eq("state", "Voting"),
  ]);
  const wallets = (check(members, "loading members") as Array<{ wallet_address: string }>).map((m) => m.wallet_address);
  const profiles = await profilesByWallet(wallets.slice(0, 50));
  const withPhotosFirst = [...wallets.slice(0, 50)].sort((a, b) => Number(!!profiles.get(b)) - Number(!!profiles.get(a)));

  return ok({
    groupId: Number(groupId),
    name: row?.name ?? null,
    memberCount: wallets.length,
    openDares: open.count ?? 0,
    votingDares: voting.count ?? 0,
    members: withPhotosFirst.slice(0, 5).map((w) => toPublic(w, profiles.get(w))),
  });
});
