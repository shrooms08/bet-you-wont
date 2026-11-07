import "server-only";
import { computeScores, type ScoreDare, type ScoreFreeze, type ScoreVote } from "./score";
import { selectAll } from "./selectAll";
import { db } from "./supabase";

/**
 * Loads everything scoring needs from the synced tables and computes scores. Small-scale
 * approach (reads all settled dares, votes and freezes); memoized for 5 s so a burst of requests
 * shares one computation. See the concerns in PHASE3C2B2_REPORT.md for scaling.
 */
let memo: { at: number; value: ReturnType<typeof computeScores> } | null = null;

export async function scoreSnapshot(maxAgeMs = 5000) {
  if (memo && Date.now() - memo.at < maxAgeMs) return memo.value;
  // L-9: paged reads, so scores never silently stop at PostgREST's 1,000-row cap
  type D = { id: number; group_id: number; creator_wallet: string; doer_wallet: string | null; amount: string; state: string; outcome: string; payout: string | null; burned: string | null; settled_at: string | null };
  const [daresAll, votesAll, freezesAll] = await Promise.all([
    selectAll<D>("dares", "id, group_id, creator_wallet, doer_wallet, amount::text, state, outcome, payout::text, burned::text, settled_at", "id"),
    selectAll<{ dare_id: number; voter_wallet: string; created_at: string | null }>("votes", "dare_id, voter_wallet, created_at", "dare_id,voter_wallet"),
    selectAll<{ wallet_address: string; week: string; amount: string }>("streak_freezes", "wallet_address, week, amount::text", "tx_hash"),
  ]);
  const dares: ScoreDare[] = daresAll.map((d) => ({
    id: Number(d.id),
    groupId: Number(d.group_id),
    creator: d.creator_wallet,
    doer: d.doer_wallet,
    amount: BigInt(d.amount ?? "0"),
    state: d.state,
    outcome: d.outcome,
    payout: d.payout ? BigInt(d.payout) : null,
    burned: d.burned ? BigInt(d.burned) : null,
    settledAt: d.settled_at,
  }));
  const votes: ScoreVote[] = votesAll.map((v) => ({
    dareId: Number(v.dare_id),
    voter: v.voter_wallet,
    createdAt: v.created_at,
  }));
  const freezes: ScoreFreeze[] = freezesAll.map((f) => ({
    wallet: f.wallet_address,
    week: f.week,
    amount: BigInt(f.amount),
  }));
  const value = computeScores({ dares, votes, freezes }, Date.now());
  memo = { at: Date.now(), value };
  return value;
}

/** Recompute and store user_stats for every wallet that appears in the data. */
export async function recomputeStats() {
  memo = null;
  const { stats } = await scoreSnapshot(0);
  const now = new Date().toISOString();
  const rows = [...stats.values()].map((s) => ({
    wallet_address: s.wallet,
    score: s.score,
    score_week: s.scoreWeek,
    current_streak: s.currentStreak,
    best_streak: s.bestStreak,
    week_qualified: s.weekQualified,
    dares_done: s.daresDone,
    dares_dared: s.daresDared,
    wif_won: s.wifWon.toString(),
    wif_burned: s.wifBurned.toString(),
    updated_at: now,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db().from("user_stats").upsert(rows.slice(i, i + 500), { onConflict: "wallet_address" });
    if (error) throw new Error(`upsert user_stats: ${error.message}`);
  }
  return rows.length;
}

/** Stats for one wallet in API shape (bigints as decimal strings). Zeros if the wallet has none. */
export async function statsFor(wallet: string) {
  const { stats } = await scoreSnapshot();
  const s = stats.get(wallet.toLowerCase());
  return {
    score: s?.score ?? 0,
    scoreWeek: s?.scoreWeek ?? 0,
    currentStreak: s?.currentStreak ?? 0,
    bestStreak: s?.bestStreak ?? 0,
    weekQualified: s?.weekQualified ?? false,
    daresDone: s?.daresDone ?? 0,
    daresDared: s?.daresDared ?? 0,
    wifWon: (s?.wifWon ?? BigInt(0)).toString(),
    wifBurned: (s?.wifBurned ?? BigInt(0)).toString(),
    freezeOffer: s?.freezeOffer ?? null,
  };
}
export type StatsView = Awaited<ReturnType<typeof statsFor>>;
