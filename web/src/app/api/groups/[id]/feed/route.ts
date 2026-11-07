import { requireCaller } from "@/server/auth";
import { isMemberOnchain } from "@/server/chain";
import { LIVE_STATES } from "@/server/dareRules";
import { buildDareViews, proofsByHash, votedDareIds } from "@/server/dareView";
import { ApiError, ok, getRoute } from "@/server/http";
import { DARE_COLUMNS, profilesByWallet, toPublic, type DareRow, type GroupRow } from "@/server/queries";
import { check, db } from "@/server/supabase";
import { sync } from "@/server/sync";
import { idSchema } from "@/server/validation";

const sum = (values: Array<string | null>) => values.reduce((acc, v) => acc + BigInt(v ?? 0), BigInt(0));

async function loadGroup(id: string) {
  return (check(await db().from("groups").select("*").eq("id", id).limit(1), "loading group") as GroupRow[])[0];
}

// GET /api/groups/<id>/feed: auth, members only (checked onchain). Everything the group screen needs.
export const GET = getRoute(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const caller = await requireCaller(request);
  const groupId = idSchema.parse((await ctx.params).id);
  if (!(await isMemberOnchain(groupId, caller.wallet))) throw new ApiError(403, "You are not a member of this group.");

  const id = groupId.toString();
  let group = await loadGroup(id);
  if (!group) {
    await sync({ force: true, waitMs: 10_000 }).catch(() => null); // brand-new group not synced yet
    group = await loadGroup(id);
    if (!group) throw new ApiError(404, "Group not synced yet. Try again in a few seconds.");
  }

  const [membersRes, daresRes] = await Promise.all([
    db().from("group_members").select("wallet_address, joined_at, join_tx, join_index").eq("group_id", id).order("joined_at"),
    db().from("dares").select(DARE_COLUMNS).eq("group_id", id).order("id", { ascending: false }),
  ]);
  const members = check(membersRes, "loading members") as Array<{ wallet_address: string; joined_at: string | null; join_tx: string | null; join_index: number | null }>;
  const dares = check(daresRes, "loading dares") as unknown as DareRow[];

  const me = caller.wallet.toLowerCase();
  const [profiles, proofs, voted] = await Promise.all([
    profilesByWallet([...members.map((m) => m.wallet_address), ...dares.flatMap((d) => [d.creator_wallet, d.target_wallet, d.doer_wallet])]),
    proofsByHash(dares.map((d) => d.proof_hash)),
    votedDareIds(me, dares.map((d) => Number(d.id))),
  ]);
  const myJoinIndex = members.find((m) => m.wallet_address === me)?.join_index ?? null;

  return ok({
    viewer: me,
    group: {
      id: Number(group.id),
      name: group.name,
      isPublic: group.is_public,
      creator: toPublic(group.creator_wallet, profiles.get(group.creator_wallet)),
      inviteCode: group.invite_code,
      createdAt: group.created_at,
    },
    members: members.map((m) => ({ ...toPublic(m.wallet_address, profiles.get(m.wallet_address)), joinedAt: m.joined_at })),
    stats: {
      memberCount: members.length,
      openDares: dares.filter((d) => d.state === "Open").length,
      liveDares: dares.filter((d) => LIVE_STATES.includes(d.state)).length,
      paidOut: sum(dares.filter((d) => d.outcome === "Passed").map((d) => d.payout)).toString(),
      refunded: sum(dares.filter((d) => d.outcome === "Failed" || d.outcome === "Expired" || d.outcome === "NoVotes").map((d) => d.payout)).toString(),
      burned: sum(dares.map((d) => d.burned)).toString(),
    },
    dares: buildDareViews({
      dares,
      viewer: me,
      joinIndexByGroup: new Map([[Number(group.id), myJoinIndex]]),
      voted,
      profiles,
      proofs,
    }),
  });
});
