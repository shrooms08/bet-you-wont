import { requireCaller } from "@/server/auth";
import { PUBLIC_GROUP_ID } from "@/server/access";
import { hiddenFor } from "@/server/moderationRules";
import { proofsForDares, reportedBy } from "@/server/dareView";
import { ApiError, getRoute, ok } from "@/server/http";
import { toPublic, type ProfileRow } from "@/server/queries";
import { statsFor } from "@/server/stats";
import { check, db } from "@/server/supabase";
import { usernameSchema } from "@/server/validation";

type Row = {
  id: number;
  group_id: number;
  proof_hash: string | null;
  state: string;
  outcome: string;
  creator_wallet: string;
  doer_wallet: string | null;
  text_hidden_at: string | null;
  media_hidden_at: string | null;
};

// GET /api/users/<username>: auth. Profile, score/streak stats, and a grid of proofs as the doer
// ("did") and as the creator ("dared"), limited to dares the viewer may see (their wifies + public).
export const GET = getRoute(async (request: Request, ctx: { params: Promise<{ username: string }> }) => {
  const caller = await requireCaller(request);
  const username = usernameSchema.parse(decodeURIComponent((await ctx.params).username));
  const profile = (check(await db().from("profiles").select("*").eq("username", username).limit(1), "loading profile") as ProfileRow[])[0];
  if (!profile) throw new ApiError(404, `no one called @${username}`);
  const wallet = profile.wallet_address;
  const me = caller.wallet.toLowerCase();

  const [stats, myGroupsRes, daresRes] = await Promise.all([
    statsFor(wallet),
    db().from("group_members").select("group_id").eq("wallet_address", me),
    db()
      .from("dares")
      .select("id, group_id, proof_hash, state, outcome, creator_wallet, doer_wallet, text_hidden_at, media_hidden_at")
      .or(`doer_wallet.eq.${wallet},creator_wallet.eq.${wallet}`)
      .not("proof_hash", "is", null)
      .in("state", ["Voting", "Settled"])
      .order("activity_at", { ascending: false })
      .limit(120),
  ]);
  // visibility: only dares in wifies the viewer is in, or the public wifie
  const visible = new Set<number>([PUBLIC_GROUP_ID, ...(check(myGroupsRes, "loading memberships") as Array<{ group_id: number }>).map((g) => Number(g.group_id))]);
  const dares = (check(daresRes, "loading dares") as Row[]).filter((d) => visible.has(Number(d.group_id)));
  const [proofs, mine] = await Promise.all([proofsForDares(dares), reportedBy(me, dares.map((d) => Number(d.id)))]);
  const tile = (d: Row) => {
    const p = hiddenFor(d, mine).mediaHidden ? undefined : proofs.get(Number(d.id));
    return { dareId: Number(d.id), state: d.state, outcome: d.outcome, kind: p?.kind ?? "photo", thumb: p?.kind === "video" ? (p.posterUrl ?? null) : (p?.url ?? null) };
  };
  return ok({
    me: wallet === me,
    profile: { ...toPublic(wallet, { ...profile, streak: stats.currentStreak }) },
    stats,
    did: dares.filter((d) => d.doer_wallet === wallet).map(tile),
    dared: dares.filter((d) => d.creator_wallet === wallet).map(tile),
  });
});
