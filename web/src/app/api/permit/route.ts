import { timingSafeEqual } from "node:crypto";
import { requireAdult } from "@/server/age";
import type { Address } from "viem";
import { ownsWallet, requireCaller } from "@/server/auth";
import { getGroupOnchain, groupExists, isMemberOnchain } from "@/server/chain";
import { ApiError, ok, readJson, route } from "@/server/http";
import type { GroupRow } from "@/server/queries";
import { enforceRateLimit } from "@/server/rateLimit";
import { signJoinPermit } from "@/server/signer";
import { check, db } from "@/server/supabase";
import { checkPublicPermit, PUBLIC_PERMIT_ERRORS } from "@/server/permitRules";
import { permitSchema } from "@/server/validation";

const sameCode = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// POST /api/permit {groupId, inviteCode?}: auth. Signs an EIP-712 JoinPermit for the caller's wallet.
// Public groups: any logged-in user whose account is 10+ minutes old and not blocked, for ONE wallet
// per account (public_permits). Private groups: only with the group's invite code.
export const POST = route(async (request: Request) => {
  const caller = await requireCaller(request);
  await requireAdult(caller);
  const body = permitSchema.parse(await readJson(request));
  if (body.address && !ownsWallet(caller, body.address)) throw new ApiError(403, "That wallet is not linked to your account.");
  const account: Address = body.address ?? caller.wallet;

  await enforceRateLimit(`permit:${caller.userId}`, 10, 3600, "Too many permits: max 10 per hour.");

  const group = await getGroupOnchain(body.groupId);
  if (!groupExists(group)) throw new ApiError(404, `Group ${body.groupId} does not exist.`);

  if (!group.isPublic) {
    const row = (check(
      await db().from("groups").select("invite_code").eq("id", body.groupId.toString()).limit(1),
      "loading group",
    ) as Pick<GroupRow, "invite_code">[])[0];
    if (!body.inviteCode || !row?.invite_code || !sameCode(body.inviteCode, row.invite_code)) {
      throw new ApiError(403, "This group is private: you need its invite link to join.");
    }
  }

  if (await isMemberOnchain(body.groupId, account)) {
    throw new ApiError(409, `This wallet is already a member of group ${body.groupId}.`);
  }

  if (group.isPublic) {
    const [profileRes, permitRes] = await Promise.all([
      db().from("profiles").select("blocked_at").eq("privy_user_id", caller.userId).limit(1),
      db().from("public_permits").select("wallet_address").eq("privy_user_id", caller.userId).eq("group_id", body.groupId.toString()).limit(1),
    ]);
    const profile = (check(profileRes, "loading profile") as Array<{ blocked_at: string | null }>)[0];
    const existing = (check(permitRes, "loading public permits") as Array<{ wallet_address: string }>)[0];
    const verdict = checkPublicPermit({
      blocked: !!profile?.blocked_at,
      accountCreatedAt: caller.createdAt,
      now: Date.now(),
      existingWallet: existing?.wallet_address ?? null,
      wallet: account,
    });
    if (verdict !== "ok") throw new ApiError(403, PUBLIC_PERMIT_ERRORS[verdict]);
    if (!existing) {
      const { error } = await db()
        .from("public_permits")
        .insert({ privy_user_id: caller.userId, group_id: body.groupId.toString(), wallet_address: account.toLowerCase() });
      // a concurrent request for another wallet loses here (primary key)
      if (error?.code === "23505") throw new ApiError(403, PUBLIC_PERMIT_ERRORS["other-wallet"]);
      if (error) {
        console.error("[permit] public_permits:", error.message);
        throw new ApiError(502, "Database error while issuing the permit.");
      }
    }
  }

  const { deadline, signature } = await signJoinPermit(body.groupId, account);
  return ok({ groupId: body.groupId.toString(), account, deadline: deadline.toString(), signature });
});
