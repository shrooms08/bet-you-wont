import { ApiError, clientIp, ok, getRoute } from "@/server/http";
import { profilesByWallet, toPublic, type GroupRow } from "@/server/queries";
import { enforceRateLimit } from "@/server/rateLimit";
import { check, db } from "@/server/supabase";
import { inviteCodeSchema } from "@/server/validation";

// GET /api/invite/<code>: public preview of the group an invite link points to.
export const GET = getRoute(async (request: Request, ctx: { params: Promise<{ code: string }> }) => {
  await enforceRateLimit(`invite-preview:${clientIp(request)}`, 60, 60, "Too many invite lookups.");
  const { code: rawCode } = await ctx.params;
  const parsed = inviteCodeSchema.safeParse(rawCode.toLowerCase());
  if (!parsed.success) throw new ApiError(404, "That invite link is not valid.");

  const groups = check(
    await db().from("groups").select("*").eq("invite_code", parsed.data).limit(1),
    "loading invite",
  ) as GroupRow[];
  const group = groups[0];
  if (!group) throw new ApiError(404, "That invite link is not valid or has been replaced.");

  const { count, error } = await db()
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", group.id);
  if (error) throw new ApiError(502, "Database error while counting members.");
  const profiles = await profilesByWallet([group.creator_wallet]);

  return ok({
    groupId: group.id,
    name: group.name,
    isPublic: group.is_public,
    memberCount: count ?? 0,
    creator: toPublic(group.creator_wallet, profiles.get(group.creator_wallet)),
  });
});
