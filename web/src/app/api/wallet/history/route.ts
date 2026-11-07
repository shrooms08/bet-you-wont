import { requireCaller } from "@/server/auth";
import { getRoute, ok } from "@/server/http";
import { check, db } from "@/server/supabase";

type D = { id: number; group_id: number; text: string | null; amount: string; payout: string | null; burned: string | null; outcome: string; creator_wallet: string; doer_wallet: string | null; settled_tx: string | null; settled_at: string | null };

// GET /api/wallet/history: auth. Your settled dares (won / refunded / lost, with amounts and the
// settle tx) and your streak-freeze burns, newest first.
export const GET = getRoute(async (request: Request) => {
  const caller = await requireCaller(request);
  const me = caller.wallet.toLowerCase();
  const [daresRes, freezesRes] = await Promise.all([
    db()
      .from("dares")
      .select("id, group_id, text, amount::text, payout::text, burned::text, outcome, creator_wallet, doer_wallet, settled_tx, settled_at")
      .eq("state", "Settled")
      .or(`creator_wallet.eq.${me},doer_wallet.eq.${me}`)
      .order("settled_at", { ascending: false })
      .limit(100),
    db().from("streak_freezes").select("week, tx_hash, amount::text, created_at").eq("wallet_address", me).order("created_at", { ascending: false }),
  ]);
  const dares = check(daresRes, "loading history") as unknown as D[];
  const items = dares.map((d) => {
    const mine = d.creator_wallet === me ? "creator" : "doer";
    // what happened to YOUR $wif on this dare
    let kind: "won" | "refunded" | "lost" | "none";
    let amount = "0";
    if (mine === "doer") {
      kind = d.outcome === "Passed" ? "won" : "none";
      amount = d.outcome === "Passed" ? (d.payout ?? "0") : "0";
    } else if (d.outcome === "Passed") {
      kind = "lost";
      amount = d.amount;
    } else {
      kind = "refunded";
      amount = d.payout ?? d.amount;
    }
    return { type: "dare" as const, dareId: Number(d.id), text: d.text, role: mine, outcome: d.outcome, kind, amount, burned: mine === "creator" ? (d.burned ?? "0") : "0", tx: d.settled_tx, at: d.settled_at };
  });
  const freezes = (check(freezesRes, "loading freezes") as unknown as Array<{ week: string; tx_hash: string; amount: string; created_at: string }>).map((f) => ({
    type: "freeze" as const,
    week: f.week,
    amount: f.amount,
    tx: f.tx_hash,
    at: f.created_at,
  }));
  return ok({ items: [...items, ...freezes].sort((a, b) => Date.parse(b.at ?? "") - Date.parse(a.at ?? "")) });
});
