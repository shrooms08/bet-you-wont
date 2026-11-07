import { requireAdmin } from "@/server/admin";
import { requireCaller } from "@/server/auth";
import { proofsForDares } from "@/server/dareView";
import { getRoute, ok } from "@/server/http";
import { DARE_COLUMNS, profilesByWallet, toPublic, type DareRow } from "@/server/queries";
import { check, db } from "@/server/supabase";

type ReportRow = { id: string; dare_id: number; target: string; reason: string; details: string | null; reporter_wallet: string; created_at: string };

// GET /api/admin/reports: admins only (ADMIN_WALLETS). Reported dares, newest report first, with
// the full text and media (even when hidden) so they can be reviewed, plus blocked profiles.
export const GET = getRoute(async (request: Request) => {
  const caller = await requireCaller(request);
  requireAdmin(caller);

  const reports = check(
    await db().from("reports").select("id, dare_id, target, reason, details, reporter_wallet, created_at").order("created_at", { ascending: false }).limit(500),
    "loading reports",
  ) as ReportRow[];
  const dareIds = [...new Set(reports.map((r) => Number(r.dare_id)))];
  const dares = dareIds.length
    ? (check(
        await db().from("dares").select(`${DARE_COLUMNS}, text_hidden_by, media_hidden_by, text_cleared_at, media_cleared_at`).in("id", dareIds),
        "loading dares",
      ) as unknown as Array<DareRow & { text_hidden_by: string | null; media_hidden_by: string | null; text_cleared_at: string | null; media_cleared_at: string | null }>)
    : [];
  const [proofs, profiles, groupsRes, blockedRes] = await Promise.all([
    proofsForDares(dares),
    profilesByWallet([...reports.map((r) => r.reporter_wallet), ...dares.flatMap((d) => [d.creator_wallet, d.doer_wallet])]),
    dareIds.length ? db().from("groups").select("id, name, is_public").in("id", [...new Set(dares.map((d) => Number(d.group_id)))]) : Promise.resolve({ data: [], error: null }),
    db().from("profiles").select("wallet_address, username, blocked_at").not("blocked_at", "is", null),
  ]);
  const groups = new Map((check(groupsRes, "loading groups") as Array<{ id: number; name: string | null; is_public: boolean }>).map((g) => [Number(g.id), g]));
  const person = (w: string | null) => (w ? toPublic(w, profiles.get(w)) : null);

  const items = dares
    .map((d) => {
      const rs = reports.filter((r) => Number(r.dare_id) === Number(d.id));
      const g = groups.get(Number(d.group_id));
      const p = proofs.get(Number(d.id));
      return {
        dareId: Number(d.id),
        groupId: Number(d.group_id),
        groupName: g?.name ?? null,
        isPublic: g?.is_public ?? false,
        text: d.text,
        state: d.state,
        outcome: d.outcome,
        creator: person(d.creator_wallet),
        doer: person(d.doer_wallet),
        proofUrl: p?.url ?? null,
        posterUrl: p?.posterUrl ?? null,
        proofKind: p?.kind ?? null,
        hasProof: !!d.proof_hash,
        textHidden: d.text_hidden_at ? { at: d.text_hidden_at, by: d.text_hidden_by } : null,
        mediaHidden: d.media_hidden_at ? { at: d.media_hidden_at, by: d.media_hidden_by } : null,
        latestReport: rs[0]?.created_at ?? null,
        reports: rs.map((r) => ({ id: r.id, target: r.target, reason: r.reason, details: r.details, reporter: person(r.reporter_wallet), at: r.created_at })),
      };
    })
    .sort((a, b) => Date.parse(b.latestReport ?? "0") - Date.parse(a.latestReport ?? "0"));

  const blocked = (check(blockedRes, "loading blocked profiles") as Array<{ wallet_address: string; username: string; blocked_at: string }>).map((b) => ({
    wallet: b.wallet_address,
    username: b.username,
    blockedAt: b.blocked_at,
  }));
  return ok({ items, blocked });
});
