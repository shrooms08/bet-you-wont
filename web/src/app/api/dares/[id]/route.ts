import { requireCaller } from "@/server/auth";
import { crewAccess, quickSync } from "@/server/access";
import { buildDareViews, proofsByHash, reactionsFor, votedDareIds } from "@/server/dareView";
import { ApiError, getRoute, ok } from "@/server/http";
import { DARE_COLUMNS, profilesByWallet, toPublic, type DareRow } from "@/server/queries";
import { check, db } from "@/server/supabase";
import { sync } from "@/server/sync";
import { pointsFromDare } from "@/server/score";
import { scoreSnapshot } from "@/server/stats";
import { idSchema } from "@/server/validation";

async function loadDare(id: string) {
  return (check(await db().from("dares").select(DARE_COLUMNS).eq("id", id).limit(1), "loading dare") as unknown as DareRow[])[0];
}

// GET /api/dares/<id>: auth. Members of the dare's crew get everything with their action flags;
// non-members of a PUBLIC crew get a read-only view; private crews answer 404 "this dare is private".
export const GET = getRoute(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const caller = await requireCaller(request);
  const dareId = idSchema.parse((await ctx.params).id).toString();
  await quickSync();

  let dare = await loadDare(dareId);
  if (!dare) {
    await sync({ force: true, waitMs: 8_000 }).catch(() => null); // brand-new dare not synced yet
    dare = await loadDare(dareId);
  }
  if (!dare) throw new ApiError(404, "No dare with that number.");

  const me = caller.wallet.toLowerCase();
  const groupId = Number(dare.group_id);
  const access = await crewAccess(groupId, me);
  if (!access.canSee) throw new ApiError(404, "this dare is private");

  const [votesRes, membersRes] = await Promise.all([
    db().from("votes").select("voter_wallet, pass, created_at").eq("dare_id", dareId).order("created_at"),
    db().from("group_members").select("*", { count: "exact", head: true }).eq("group_id", groupId),
  ]);
  const votes = check(votesRes, "loading votes") as Array<{ voter_wallet: string; pass: boolean; created_at: string | null }>;
  const [profiles, proofs, voted, reactions] = await Promise.all([
    profilesByWallet([dare.creator_wallet, dare.target_wallet, dare.doer_wallet, ...votes.map((v) => v.voter_wallet)]),
    proofsByHash([dare.proof_hash]),
    votedDareIds(me, [Number(dare.id)]),
    reactionsFor([Number(dare.id)], me),
  ]);
  const [view] = buildDareViews({
    dares: [dare],
    viewer: me,
    joinedAtByGroup: new Map([[groupId, access.joinedAt]]),
    voted,
    profiles,
    proofs,
    reactions,
    groupNames: new Map([[groupId, access.group?.name ?? null]]),
    readOnlyGroups: access.member ? undefined : new Set([groupId]),
  });

  // "+125 score" on the result screen: what this dare earned the viewer (after their multiplier)
  const myPoints = dare.state === "Settled" ? pointsFromDare((await scoreSnapshot()).events, Number(dare.id), me) : 0;

  return ok({
    viewer: me,
    myPoints,
    member: access.member,
    group: {
      id: groupId,
      name: access.group?.name ?? null,
      isPublic: access.isPublic,
      inviteCode: access.member ? (access.group?.invite_code ?? null) : null,
      memberCount: membersRes.count ?? 0,
    },
    dare: view,
    voters: votes.map((v) => ({ ...toPublic(v.voter_wallet, profiles.get(v.voter_wallet)), pass: v.pass })),
  });
});
