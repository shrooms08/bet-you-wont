import { requireCaller } from "@/server/auth";
import { LIVE_STATES } from "@/server/dareRules";
import { buildDareViews, proofsForDares, reportedBy, votedDareIds } from "@/server/dareView";
import { clientIp, ok, getRoute } from "@/server/http";
import { enforceRouteLimit } from "@/server/rateLimit";
import { DARE_COLUMNS, groupsForWallet, profilesByWallet, type DareRow } from "@/server/queries";
import { check, db } from "@/server/supabase";

// GET /api/home: auth. "Waiting on you" across all your groups, plus the groups themselves.
export const GET = getRoute(async (request: Request) => {
  const caller = await requireCaller(request);
  const me = caller.wallet.toLowerCase();
  await enforceRouteLimit("home", clientIp(request), caller.userId);
  const groups = await groupsForWallet(me);
  const ids = groups.map((g) => g.id);

  const dares = ids.length
    ? (check(
        await db()
          .from("dares")
          .select(DARE_COLUMNS)
          .in("group_id", ids)
          .in("state", LIVE_STATES as string[])
          .order("id", { ascending: false }),
        "loading dares",
      ) as unknown as DareRow[])
    : [];

  const [profiles, proofs, voted, viewerReports] = await Promise.all([
    profilesByWallet(dares.flatMap((d) => [d.creator_wallet, d.target_wallet, d.doer_wallet])),
    proofsForDares(dares),
    votedDareIds(me, dares.map((d) => Number(d.id))),
    reportedBy(me, dares.map((d) => Number(d.id))),
  ]);
  const views = buildDareViews({
    dares,
    viewer: me,
    joinIndexByGroup: new Map(groups.map((g) => [g.id, g.joinIndex])),
    voted,
    profiles,
    proofs,
    viewerReports,
    groupNames: new Map(groups.map((g) => [g.id, g.name])),
  });

  return ok({
    wallet: me,
    waitingOnYou: {
      toAccept: views.filter((v) => v.canAccept),
      toVote: views.filter((v) => v.canVote),
      needsProof: views.filter((v) => v.canSubmitProof),
      toSettle: views.filter((v) => v.canSettle),
    },
    groups,
  });
});
