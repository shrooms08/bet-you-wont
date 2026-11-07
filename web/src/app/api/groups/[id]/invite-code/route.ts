import { requireAdult } from "@/server/age";
import { ownsWallet, requireCaller } from "@/server/auth";
import { newInviteCode } from "@/server/hashing";
import { ApiError, ok, route } from "@/server/http";
import type { GroupRow } from "@/server/queries";
import { enforceRateLimit } from "@/server/rateLimit";
import { check, db } from "@/server/supabase";
import { idSchema, INVITE_ALPHABET } from "@/server/validation";

// POST /api/groups/<id>/invite-code: auth, the wifie's creator only (L-7). Replaces the invite code;
// old links stop working at once. Permits already signed stay valid for their 10 minutes.
export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const caller = await requireCaller(request);
  await requireAdult(caller);
  const groupId = idSchema.parse((await ctx.params).id).toString();
  await enforceRateLimit(`invite-rotate:${caller.userId}`, 10, 3600, "Too many new invite links.");

  const group = (check(await db().from("groups").select("*").eq("id", groupId).limit(1), "loading group") as GroupRow[])[0];
  if (!group) throw new ApiError(404, "No wifie with that number.");
  if (!ownsWallet(caller, group.creator_wallet)) throw new ApiError(403, "Only the wifie's creator can make a new invite link.");

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newInviteCode(INVITE_ALPHABET);
    const { error } = await db().from("groups").update({ invite_code: code }).eq("id", groupId);
    if (error?.code === "23505") continue; // collision: try another
    if (error) {
      console.error("[invite-rotate]", error.message);
      throw new ApiError(502, "Database error while making a new invite link.");
    }
    return ok({ inviteCode: code, invitePath: `/i/${code}` });
  }
  throw new ApiError(502, "Could not allocate an invite code. Try again.");
});
