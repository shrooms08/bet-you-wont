import { requireCaller } from "@/server/auth";
import { PUBLIC_GROUP_ID, quickSync } from "@/server/access";
import { buildDareViews, proofsForDares, reactionsFor, reportedBy, votedDareIds } from "@/server/dareView";
import { decodeCursor, paginate } from "@/server/feedCursor";
import { clientIp, getRoute, ok } from "@/server/http";
import { enforceRouteLimit } from "@/server/rateLimit";
import { DARE_COLUMNS, profilesByWallet, type DareRow, type GroupRow } from "@/server/queries";
import { check, db } from "@/server/supabase";

const PAGE = 10;

// GET /api/feed?cursor=: auth. Newest activity first across your crews plus the public crew:
// dares with proof (Voting or Settled) as media posts, and Open dares as challenge posts.
export const GET = getRoute(async (request: Request) => {
  const caller = await requireCaller(request);
  const me = caller.wallet.toLowerCase();
  const cursor = decodeCursor(new URL(request.url).searchParams.get("cursor"));
  await enforceRouteLimit("feed", clientIp(request), caller.userId);
  await quickSync();

  const memberships = check(
    await db().from("group_members").select("group_id, joined_at, join_index").eq("wallet_address", me),
    "loading memberships",
  ) as Array<{ group_id: number; joined_at: string | null; join_index: number | null }>;
  const memberOf = new Set(memberships.map((m) => Number(m.group_id)));
  const groupIds = [...new Set([...memberOf, PUBLIC_GROUP_ID])];

  let q = db()
    .from("dares")
    .select(DARE_COLUMNS)
    .in("group_id", groupIds)
    .not("activity_at", "is", null)
    .or("and(proof_hash.not.is.null,state.in.(Voting,Settled)),state.eq.Open");
  if (cursor) q = q.or(`activity_at.lt."${cursor.at}",and(activity_at.eq."${cursor.at}",id.lt.${cursor.id})`);
  const rows = check(
    await q.order("activity_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE + 1),
    "loading feed",
  ) as unknown as DareRow[];
  const { page, next } = paginate(rows as Array<DareRow & { activity_at: string | null }>, PAGE);

  const ids = page.map((d) => Number(d.id));
  const pageGroups = [...new Set(page.map((d) => Number(d.group_id)))];
  const [groupsRes, profiles, proofs, voted, reactions, viewerReports] = await Promise.all([
    pageGroups.length ? db().from("groups").select("id, name").in("id", pageGroups) : Promise.resolve({ data: [], error: null }),
    profilesByWallet(page.flatMap((d) => [d.creator_wallet, d.target_wallet, d.doer_wallet])),
    proofsForDares(page),
    votedDareIds(me, ids),
    reactionsFor(ids, me),
    reportedBy(me, ids),
  ]);
  const groupNames = new Map((check(groupsRes, "loading crews") as Array<Pick<GroupRow, "id" | "name">>).map((g) => [Number(g.id), g.name]));
  const views = buildDareViews({
    dares: page,
    viewer: me,
    joinIndexByGroup: new Map(memberships.map((m) => [Number(m.group_id), m.join_index])),
    voted,
    profiles,
    proofs,
    viewerReports,
    reactions,
    groupNames,
    readOnlyGroups: new Set(pageGroups.filter((g) => !memberOf.has(g))),
  });

  return ok({
    items: views.map((v) => ({ ...v, post: v.proofHash && (v.state === "Voting" || v.state === "Settled") ? "media" : "challenge", member: memberOf.has(v.groupId) })),
    nextCursor: next,
  });
});
