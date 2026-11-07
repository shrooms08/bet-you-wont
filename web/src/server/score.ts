// Dare Score and weekly streaks. Pure: computed from synced dares, votes and streak freezes.
// Points are not money. Every rule here has a unit test in score.test.ts.
import { isoWeekKey, shiftWeek, weekEndMs } from "@/lib/isoWeek";

const WEI = BigInt("1000000000000000000");
export const MIN_SCORING_BOUNTY = BigInt(1000) * WEI; // only dares with bounty >= 1,000 tokens score
export const BIG_BOUNTY = BigInt(5000) * WEI; // +25 bonus at >= 5,000 tokens
export const POINTS = {
  passedDoer: 100,
  bigBounty: 25,
  passedCreator: 40,
  failedDoer: 10,
  vote: 5,
  expiredDoer: -50,
} as const;
export const PAIR_CAP_PER_WEEK = 2; // same creator->doer pair: creator/doer points from at most 2 dares per ISO week

export type ScoreDare = {
  id: number;
  groupId: number;
  creator: string;
  doer: string | null;
  amount: bigint;
  state: string; // Open | Accepted | Voting | Settled | Cancelled
  outcome: string; // None | Passed | Failed | Expired
  payout: bigint | null;
  burned: bigint | null;
  settledAt: string | null;
};
export type ScoreVote = { dareId: number; voter: string; createdAt: string | null };
export type ScoreFreeze = { wallet: string; week: string; amount: bigint };

export type EventKind = "passed_doer" | "big_bounty" | "passed_creator" | "failed_doer" | "vote" | "expired_doer";
export type ScoreEvent = {
  wallet: string;
  dareId: number;
  groupId: number;
  week: string;
  kind: EventKind;
  base: number; // points before the streak multiplier (0 when capped)
  capped: boolean; // pair cap hit: scores 0
  points: number; // after the multiplier (positive points only are multiplied)
};

export type WalletStats = {
  wallet: string;
  score: number;
  scoreWeek: number;
  currentStreak: number;
  bestStreak: number;
  weekQualified: boolean;
  daresDone: number;
  daresDared: number;
  wifWon: bigint;
  wifBurned: bigint;
  qualifiedWeeks: string[];
  freezeOffer: { week: string; streak: number } | null;
};

/** min(1.5, 1 + 0.1 * (streak - 1)), streak at least 1. */
export function multiplierFor(streakAtWeek: number): number {
  const s = Math.max(1, streakAtWeek);
  return Math.min(1.5, Math.round((1 + 0.1 * (s - 1)) * 10) / 10);
}

/** Length of the run of qualifying weeks ending at `week` (0 if `week` doesn't qualify). */
export function runEndingAt(qualified: Set<string>, week: string): number {
  let n = 0;
  let w = week;
  while (qualified.has(w)) {
    n++;
    w = shiftWeek(w, -1);
  }
  return n;
}

/** Current streak: run ending this week, or ending last week if this week hasn't qualified yet. */
export function currentStreak(qualified: Set<string>, thisWeek: string): number {
  return qualified.has(thisWeek) ? runEndingAt(qualified, thisWeek) : runEndingAt(qualified, shiftWeek(thisWeek, -1));
}

export function bestStreak(qualified: Set<string>): number {
  let best = 0;
  for (const w of qualified) if (!qualified.has(shiftWeek(w, -1))) best = Math.max(best, runEndingAtForward(qualified, w));
  return best;
}
function runEndingAtForward(qualified: Set<string>, start: string): number {
  let n = 0;
  let w = start;
  while (qualified.has(w)) {
    n++;
    w = shiftWeek(w, 1);
  }
  return n;
}

/**
 * When a freeze would save a streak of 2+:
 * - last week didn't qualify but the run before it was >= 2  -> freeze last week
 * - this week hasn't qualified, the run ending last week is >= 2 and under 24h are left -> freeze this week
 */
export function freezeOffer(qualified: Set<string>, now: number): { week: string; streak: number } | null {
  const thisWeek = isoWeekKey(now);
  const lastWeek = shiftWeek(thisWeek, -1);
  if (!qualified.has(lastWeek)) {
    const before = runEndingAt(qualified, shiftWeek(lastWeek, -1));
    if (before >= 2) return { week: lastWeek, streak: before };
  }
  if (!qualified.has(thisWeek)) {
    const run = runEndingAt(qualified, lastWeek);
    if (run >= 2 && weekEndMs(thisWeek) - now < 86_400_000) return { week: thisWeek, streak: run };
  }
  return null;
}

const weekOf = (iso: string | null) => (iso ? isoWeekKey(new Date(iso)) : null);

/** Everything: events (for leaderboards), and per-wallet stats. `now` decides "this week". */
export function computeScores(input: { dares: ScoreDare[]; votes: ScoreVote[]; freezes: ScoreFreeze[] }, now: number) {
  const thisWeek = isoWeekKey(now);
  const raw: Array<Omit<ScoreEvent, "points">> = [];
  const byId = new Map(input.dares.map((d) => [d.id, d]));
  const scoring = (d: ScoreDare | undefined) => !!d && d.amount >= MIN_SCORING_BOUNTY;

  // --- dare outcomes (dated by settle time), with the per-pair weekly cap on positive points
  const settled = input.dares
    .filter((d) => d.state === "Settled" && d.settledAt && scoring(d))
    .sort((a, b) => Date.parse(a.settledAt!) - Date.parse(b.settledAt!) || a.id - b.id);
  const pairCount = new Map<string, number>();
  for (const d of settled) {
    const week = weekOf(d.settledAt)!;
    const base = { dareId: d.id, groupId: d.groupId, week };
    if (d.outcome === "Expired") {
      if (d.doer) raw.push({ ...base, wallet: d.doer, kind: "expired_doer", base: POINTS.expiredDoer, capped: false });
      continue;
    }
    if (!d.doer || (d.outcome !== "Passed" && d.outcome !== "Failed")) continue;
    const pair = `${d.creator}->${d.doer}|${week}`;
    const n = (pairCount.get(pair) ?? 0) + 1;
    pairCount.set(pair, n);
    const capped = n > PAIR_CAP_PER_WEEK;
    const ev = (wallet: string, kind: EventKind, pts: number) => raw.push({ ...base, wallet, kind, base: capped ? 0 : pts, capped });
    if (d.outcome === "Passed") {
      ev(d.doer, "passed_doer", POINTS.passedDoer);
      if (d.amount >= BIG_BOUNTY) ev(d.doer, "big_bounty", POINTS.bigBounty);
      ev(d.creator, "passed_creator", POINTS.passedCreator);
    } else {
      ev(d.doer, "failed_doer", POINTS.failedDoer);
    }
  }

  // --- votes (dated by vote time) on scoring dares
  for (const v of input.votes) {
    const d = byId.get(v.dareId);
    const week = weekOf(v.createdAt);
    if (!scoring(d) || !week) continue;
    raw.push({ wallet: v.voter, dareId: v.dareId, groupId: d!.groupId, week, kind: "vote", base: POINTS.vote, capped: false });
  }

  // --- qualifying weeks per wallet: doer or creator of a Passed (scoring) dare settled that week, or a freeze
  const qualified = new Map<string, Set<string>>();
  const q = (w: string) => qualified.get(w) ?? qualified.set(w, new Set()).get(w)!;
  for (const d of settled) {
    if (d.outcome !== "Passed" || !d.doer) continue;
    const week = weekOf(d.settledAt)!;
    q(d.doer).add(week);
    q(d.creator).add(week);
  }
  for (const f of input.freezes) q(f.wallet).add(f.week);

  // --- multiply positive points by the streak multiplier of that week
  const events: ScoreEvent[] = raw.map((e) => {
    const mult = multiplierFor(runEndingAt(qualified.get(e.wallet) ?? new Set(), e.week));
    return { ...e, points: e.base > 0 ? Math.round(e.base * mult) : e.base };
  });

  // --- per-wallet stats
  const wallets = new Set<string>([...events.map((e) => e.wallet), ...qualified.keys()]);
  for (const d of input.dares) {
    wallets.add(d.creator);
    if (d.doer) wallets.add(d.doer);
  }
  const stats = new Map<string, WalletStats>();
  for (const w of wallets) {
    const qs = qualified.get(w) ?? new Set<string>();
    const mine = events.filter((e) => e.wallet === w);
    const freezeBurn = input.freezes.filter((f) => f.wallet === w).reduce((a, f) => a + f.amount, BigInt(0));
    stats.set(w, {
      wallet: w,
      score: mine.reduce((a, e) => a + e.points, 0),
      scoreWeek: mine.filter((e) => e.week === thisWeek).reduce((a, e) => a + e.points, 0),
      currentStreak: currentStreak(qs, thisWeek),
      bestStreak: bestStreak(qs),
      weekQualified: qs.has(thisWeek),
      daresDone: input.dares.filter((d) => d.doer === w && d.state === "Settled" && d.outcome === "Passed").length,
      daresDared: input.dares.filter((d) => d.creator === w && d.state !== "Cancelled").length,
      wifWon: input.dares
        .filter((d) => d.doer === w && d.outcome === "Passed")
        .reduce((a, d) => a + (d.payout ?? BigInt(0)), BigInt(0)),
      wifBurned:
        input.dares.filter((d) => d.creator === w && d.state === "Settled").reduce((a, d) => a + (d.burned ?? BigInt(0)), BigInt(0)) +
        freezeBurn,
      qualifiedWeeks: [...qs].sort(),
      freezeOffer: freezeOffer(qs, now),
    });
  }
  return { events, stats };
}

/** Wifie leaderboard: points earned in one group, this week or all time, highest first. */
export function leaderboard(events: ScoreEvent[], groupId: number, period: "week" | "all", now: number) {
  const thisWeek = isoWeekKey(now);
  const totals = new Map<string, number>();
  for (const e of events) {
    if (e.groupId !== groupId || (period === "week" && e.week !== thisWeek)) continue;
    totals.set(e.wallet, (totals.get(e.wallet) ?? 0) + e.points);
  }
  return [...totals.entries()].map(([wallet, points]) => ({ wallet, points })).sort((a, b) => b.points - a.points || a.wallet.localeCompare(b.wallet));
}

/** Points one wallet earned from one dare (for "+125 score" on the result screen). */
export function pointsFromDare(events: ScoreEvent[], dareId: number, wallet: string): number {
  return events.filter((e) => e.dareId === dareId && e.wallet === wallet).reduce((a, e) => a + e.points, 0);
}
