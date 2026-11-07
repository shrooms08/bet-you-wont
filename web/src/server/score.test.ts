import { describe, expect, it } from "vitest";
import { isoWeekKey, parseWeek, shiftWeek, weekEndMs, weekStartMs } from "@/lib/isoWeek";
import { FREEZE_COST_WEI, streakAtRisk } from "@/lib/streak";
import { checkFreeze, ZERO, type TransferLog } from "./freeze";
import {
  bestStreak,
  computeScores,
  currentStreak,
  freezeOffer,
  leaderboard,
  multiplierFor,
  pointsFromDare,
  runEndingAt,
  type ScoreDare,
  type ScoreVote,
} from "./score";
import { ageGate, profileAgeDecision, visibilityFor } from "./visibility";

const WEI = BigInt("1000000000000000000");
const tok = (n: number) => BigInt(n) * WEI;
const A = "0xaaaa"; // creator
const B = "0xbbbb"; // doer
const C = "0xcccc"; // voter
// Wednesday 2026-11-04 12:00 UTC is in ISO week 2026-W45 (Mon 2 Nov - Sun 8 Nov).
const NOW = Date.parse("2026-11-04T12:00:00Z");
const at = (iso: string) => new Date(iso).toISOString();

function dare(p: Partial<ScoreDare> & { id: number }): ScoreDare {
  return { groupId: 7, creator: A, doer: B, amount: tok(2000), state: "Settled", outcome: "Passed", payout: tok(1900), burned: tok(100), settledAt: at("2026-11-03T10:00:00Z"), ...p };
}
const run = (dares: ScoreDare[], votes: ScoreVote[] = [], freezes: Array<{ wallet: string; week: string; amount: bigint }> = [], now = NOW) =>
  computeScores({ dares, votes, freezes }, now);

describe("ISO weeks (UTC)", () => {
  it("computes ISO week keys, including year rollover edges", () => {
    expect(isoWeekKey(new Date("2026-11-04T12:00:00Z"))).toBe("2026-W45");
    expect(isoWeekKey(new Date("2026-11-02T00:00:00Z"))).toBe("2026-W45"); // Monday 00:00 starts the week
    expect(isoWeekKey(new Date("2026-11-01T23:59:59Z"))).toBe("2026-W44"); // Sunday night is the previous week
    expect(isoWeekKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53"); // Fri 1 Jan 2027 belongs to 2026-W53
    expect(isoWeekKey(new Date("2027-01-04T00:00:00Z"))).toBe("2027-W01");
    expect(isoWeekKey(new Date("2024-12-30T00:00:00Z"))).toBe("2025-W01"); // Mon 30 Dec 2024 is 2025-W01
    expect(isoWeekKey(new Date("2021-01-03T23:00:00Z"))).toBe("2020-W53");
  });
  it("UTC, not local time: 23:30 UTC Sunday is still that week", () => {
    expect(isoWeekKey(Date.parse("2026-11-08T23:30:00Z"))).toBe("2026-W45");
    expect(isoWeekKey(Date.parse("2026-11-09T00:00:00Z"))).toBe("2026-W46");
  });
  it("week starts, ends and shifts across years", () => {
    expect(new Date(weekStartMs("2026-W45")).toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(new Date(weekEndMs("2026-W45")).toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(shiftWeek("2026-W53", 1)).toBe("2027-W01");
    expect(shiftWeek("2027-W01", -1)).toBe("2026-W53");
    expect(shiftWeek("2025-W01", -1)).toBe("2024-W52");
    expect(parseWeek("2026-45")).toBeNull();
  });
});

describe("scoring rules", () => {
  it("passed: doer +100, creator +40; +25 bonus at >= 5,000 tokens", () => {
    const s = run([dare({ id: 1 })]);
    expect(s.stats.get(B)!.score).toBe(100);
    expect(s.stats.get(A)!.score).toBe(40);
    const big = run([dare({ id: 2, amount: tok(5000) })]);
    expect(big.stats.get(B)!.score).toBe(125);
    expect(pointsFromDare(big.events, 2, B)).toBe(125);
    expect(run([dare({ id: 3, amount: tok(4999) })]).stats.get(B)!.score).toBe(100);
    expect(run([dare({ id: 4, amount: tok(10000) })]).stats.get(B)!.score).toBe(125); // still one +25, not stacked
  });
  it("failed: doer +10 (proof posted, voted down), creator nothing", () => {
    const s = run([dare({ id: 1, outcome: "Failed" })]);
    expect(s.stats.get(B)!.score).toBe(10);
    expect(s.stats.get(A)!.score).toBe(0);
  });
  it("expired: doer -50", () => {
    const s = run([dare({ id: 1, outcome: "Expired", burned: BigInt(0) })]);
    expect(s.stats.get(B)!.score).toBe(-50);
    expect(s.stats.get(A)!.score).toBe(0);
  });
  it("each vote +5, dated by the vote", () => {
    const s = run([dare({ id: 1, state: "Voting", outcome: "None", settledAt: null })], [{ dareId: 1, voter: C, createdAt: at("2026-11-03T09:00:00Z") }]);
    expect(s.stats.get(C)!.score).toBe(5);
    expect(s.stats.get(C)!.scoreWeek).toBe(5);
  });
  it("open, accepted, voting and cancelled dares score nothing for doer/creator", () => {
    for (const state of ["Open", "Accepted", "Voting", "Cancelled"]) {
      const s = run([dare({ id: 1, state, outcome: "None" })]);
      expect(s.stats.get(B)?.score ?? 0).toBe(0);
    }
  });
});

describe("anti-farming", () => {
  it("dares under 1,000 tokens score nothing, and neither do votes on them", () => {
    const s = run([dare({ id: 1, amount: tok(999) })], [{ dareId: 1, voter: C, createdAt: at("2026-11-03T09:00:00Z") }]);
    expect(s.stats.get(B)!.score).toBe(0);
    expect(s.stats.get(A)!.score).toBe(0);
    expect(s.stats.get(C)?.score ?? 0).toBe(0);
    expect(run([dare({ id: 1, amount: tok(1000) })]).stats.get(B)!.score).toBe(100); // exactly 1,000 counts
  });
  it("same creator->doer pair: only 2 dares per ISO week earn creator/doer points", () => {
    const s = run([1, 2, 3].map((id) => dare({ id, settledAt: at(`2026-11-0${id + 1}T10:00:00Z`) })));
    expect(s.stats.get(B)!.score).toBe(200);
    expect(s.stats.get(A)!.score).toBe(80);
    expect(s.events.filter((e) => e.dareId === 3).every((e) => e.capped && e.points === 0)).toBe(true);
  });
  it("the cap resets next ISO week and doesn't touch other pairs", () => {
    const s = run([
      dare({ id: 1, settledAt: at("2026-10-27T10:00:00Z") }),
      dare({ id: 2, settledAt: at("2026-10-28T10:00:00Z") }),
      dare({ id: 3, settledAt: at("2026-11-02T10:00:00Z") }), // next week: scores again
      dare({ id: 4, creator: C, settledAt: at("2026-11-02T11:00:00Z") }), // different pair
    ]);
    expect(s.events.filter((e) => e.capped)).toHaveLength(0);
  });
  it("the cap counts Failed dares too; Expired penalties are never capped", () => {
    const s = run([
      dare({ id: 1, outcome: "Failed" }),
      dare({ id: 2, outcome: "Failed" }),
      dare({ id: 3 }),
      dare({ id: 4, outcome: "Expired" }),
    ]);
    expect(s.events.find((e) => e.dareId === 3 && e.kind === "passed_doer")!.capped).toBe(true);
    expect(s.events.find((e) => e.dareId === 4)!.points).toBe(-50);
  });
});

describe("streaks and multiplier", () => {
  const Q = (...w: string[]) => new Set(w);
  it("multiplier: 1.0, 1.1 ... capped at 1.5", () => {
    expect([0, 1, 2, 3, 5, 6, 10].map(multiplierFor)).toEqual([1, 1, 1.1, 1.2, 1.4, 1.5, 1.5]);
  });
  it("current streak ends this week, or last week if this week is still in progress", () => {
    expect(currentStreak(Q("2026-W43", "2026-W44", "2026-W45"), "2026-W45")).toBe(3);
    expect(currentStreak(Q("2026-W43", "2026-W44"), "2026-W45")).toBe(2); // this week not yet: still 2
    expect(currentStreak(Q("2026-W42", "2026-W43"), "2026-W45")).toBe(0); // missed last week: broken
    expect(currentStreak(Q("2026-W52", "2026-W53", "2027-W01"), "2027-W01")).toBe(3); // across the year
  });
  it("best streak and run lengths", () => {
    const q = Q("2026-W30", "2026-W31", "2026-W32", "2026-W40", "2026-W41");
    expect(bestStreak(q)).toBe(3);
    expect(runEndingAt(q, "2026-W41")).toBe(2);
    expect(runEndingAt(q, "2026-W35")).toBe(0);
    expect(bestStreak(Q())).toBe(0);
  });
  it("a week qualifies for the doer and the creator of a Passed dare settled that week", () => {
    const s = run([dare({ id: 1 })]);
    expect(s.stats.get(B)!.weekQualified).toBe(true);
    expect(s.stats.get(A)!.weekQualified).toBe(true);
    expect(run([dare({ id: 1, outcome: "Failed" })]).stats.get(B)!.weekQualified).toBe(false);
  });
  it("points in a week are multiplied by that week's streak; penalties are not", () => {
    // B passes a dare each week for 3 weeks: x1.0, x1.1, x1.2
    const s = run([
      dare({ id: 1, settledAt: at("2026-10-20T10:00:00Z") }),
      dare({ id: 2, settledAt: at("2026-10-27T10:00:00Z") }),
      dare({ id: 3, settledAt: at("2026-11-03T10:00:00Z"), amount: tok(5000) }),
      dare({ id: 4, settledAt: at("2026-11-03T11:00:00Z"), outcome: "Expired", creator: C }),
    ]);
    expect(pointsFromDare(s.events, 1, B)).toBe(100);
    expect(pointsFromDare(s.events, 2, B)).toBe(110);
    expect(pointsFromDare(s.events, 3, B)).toBe(150); // 125 * 1.2
    expect(pointsFromDare(s.events, 4, B)).toBe(-50);
    const b = s.stats.get(B)!;
    expect(b.score).toBe(310);
    expect(b.scoreWeek).toBe(100);
    expect(b.currentStreak).toBe(3);
    expect(b.bestStreak).toBe(3);
  });
  it("a freeze makes its week qualify (no points) and counts as burned $wif", () => {
    const s = run([dare({ id: 1, settledAt: at("2026-10-20T10:00:00Z") }), dare({ id: 2, settledAt: at("2026-11-03T10:00:00Z") })], [], [{ wallet: B, week: "2026-W44", amount: FREEZE_COST_WEI }]);
    const b = s.stats.get(B)!;
    expect(b.currentStreak).toBe(3);
    expect(b.score).toBe(100 + 120); // week 3 of the streak: x1.2
    expect(b.wifBurned).toBe(FREEZE_COST_WEI);
  });
  it("freeze offer: last week missed after a 2+ streak, or under 24h left this week", () => {
    expect(freezeOffer(Q("2026-W42", "2026-W43"), NOW)).toEqual({ week: "2026-W44", streak: 2 });
    expect(freezeOffer(Q("2026-W43"), NOW)).toBeNull(); // only a 1-week streak
    expect(freezeOffer(Q("2026-W43", "2026-W44"), NOW)).toBeNull(); // plenty of time left this week
    expect(freezeOffer(Q("2026-W43", "2026-W44"), Date.parse("2026-11-08T12:00:00Z"))).toEqual({ week: "2026-W45", streak: 2 });
    expect(freezeOffer(Q("2026-W43", "2026-W44", "2026-W45"), Date.parse("2026-11-08T12:00:00Z"))).toBeNull();
  });
  it("streak at risk from Thursday (UTC) when this week hasn't qualified", () => {
    const s = { currentStreak: 2, weekQualified: false };
    expect(streakAtRisk(s, Date.parse("2026-11-04T12:00:00Z"))).toBe(false); // Wednesday
    expect(streakAtRisk(s, Date.parse("2026-11-05T00:00:00Z"))).toBe(true); // Thursday
    expect(streakAtRisk(s, Date.parse("2026-11-08T20:00:00Z"))).toBe(true); // Sunday
    expect(streakAtRisk({ ...s, weekQualified: true }, Date.parse("2026-11-06T12:00:00Z"))).toBe(false);
    expect(streakAtRisk({ currentStreak: 0, weekQualified: false }, Date.parse("2026-11-06T12:00:00Z"))).toBe(false);
  });
});

describe("stats and leaderboard", () => {
  it("dares done/dared, $wif won and burned (bounties you put up + freezes)", () => {
    const s = run([
      dare({ id: 1, amount: tok(5000), payout: tok(4750), burned: tok(250) }),
      dare({ id: 2, outcome: "Failed", payout: tok(4500), burned: tok(500) }),
      dare({ id: 3, state: "Cancelled", outcome: "None", payout: null, burned: null }),
    ]);
    expect(s.stats.get(B)!.daresDone).toBe(1);
    expect(s.stats.get(B)!.wifWon).toBe(tok(4750));
    expect(s.stats.get(A)!.daresDared).toBe(2); // cancelled doesn't count
    expect(s.stats.get(A)!.wifBurned).toBe(tok(750));
  });
  it("per-wifie leaderboard, this week vs all time", () => {
    const s = run(
      [dare({ id: 1, settledAt: at("2026-10-27T10:00:00Z") }), dare({ id: 2 }), dare({ id: 3, groupId: 9 })],
      [{ dareId: 2, voter: C, createdAt: at("2026-11-03T09:00:00Z") }],
    );
    expect(leaderboard(s.events, 7, "all", NOW)).toEqual([
      { wallet: B, points: 210 },
      { wallet: A, points: 84 },
      { wallet: C, points: 5 },
    ]);
    expect(leaderboard(s.events, 7, "week", NOW).map((r) => r.wallet)).toEqual([B, A, C]);
    expect(leaderboard(s.events, 7, "week", NOW)[0].points).toBe(110);
    expect(leaderboard(s.events, 9, "all", NOW)[0]).toEqual({ wallet: B, points: 110 }); // group 9's dare (x1.1 streak week)
  });
});

describe("streak freeze validation", () => {
  const token = "0x00000000000000000000000000000000000000f1";
  const me = "0x00000000000000000000000000000000000000a1";
  const burn = (p: Partial<TransferLog> = {}): TransferLog => ({ token, from: me, to: ZERO, value: FREEZE_COST_WEI, ...p });
  const base = { token, linkedWallets: [me.toUpperCase()], minAmount: FREEZE_COST_WEI, txAlreadyUsed: false, weeksAlreadyFrozen: [] as string[], week: "2026-W45", now: NOW };
  it("accepts a 2,000 $wif burn from your wallet for this week or last week", () => {
    expect(checkFreeze({ ...base, transfers: [burn()] })).toEqual({ result: "ok", from: me, amount: FREEZE_COST_WEI });
    expect(checkFreeze({ ...base, week: "2026-W44", transfers: [burn()] }).result).toBe("ok");
  });
  it("rejects every bad case", () => {
    expect(checkFreeze({ ...base, transfers: [burn({ token: "0x00000000000000000000000000000000000000f2" })] }).result).toBe("wrong-token");
    expect(checkFreeze({ ...base, transfers: [] }).result).toBe("wrong-token");
    expect(checkFreeze({ ...base, transfers: [burn({ from: "0x00000000000000000000000000000000000000b2" })] }).result).toBe("wrong-sender");
    expect(checkFreeze({ ...base, transfers: [burn({ to: "0x00000000000000000000000000000000000000c3" })] }).result).toBe("not-burn");
    expect(checkFreeze({ ...base, transfers: [burn({ value: FREEZE_COST_WEI - BigInt(1) })] }).result).toBe("too-small");
    expect(checkFreeze({ ...base, txAlreadyUsed: true, transfers: [burn()] }).result).toBe("reused-tx");
    expect(checkFreeze({ ...base, week: "2026-W43", transfers: [burn()] }).result).toBe("wrong-week");
    expect(checkFreeze({ ...base, week: "2026-W46", transfers: [burn()] }).result).toBe("wrong-week");
    expect(checkFreeze({ ...base, weeksAlreadyFrozen: ["2026-W45"], transfers: [burn()] }).result).toBe("already-frozen");
  });
});

describe("age gate and visibility", () => {
  it("write routes need a profile with age confirmed", () => {
    expect(ageGate(null)).toBe("no-profile");
    expect(ageGate({ age_confirmed_at: null })).toBe("unconfirmed");
    expect(ageGate({ age_confirmed_at: "2026-11-07T10:00:00Z" })).toBe("ok");
  });
  it("profile route: creating needs ageConfirmed; unconfirmed profiles confirm once", () => {
    expect(profileAgeDecision(null, undefined)).toEqual({ ok: false });
    expect(profileAgeDecision(null, false)).toEqual({ ok: false });
    expect(profileAgeDecision(null, true)).toEqual({ ok: true, setAge: true });
    expect(profileAgeDecision({ age_confirmed_at: null }, undefined)).toEqual({ ok: false });
    expect(profileAgeDecision({ age_confirmed_at: null }, true)).toEqual({ ok: true, setAge: true });
    expect(profileAgeDecision({ age_confirmed_at: "2026-11-07T10:00:00Z" }, undefined)).toEqual({ ok: true, setAge: false });
  });
  it("share card / dare visibility: members full, public read-only, private hidden", () => {
    expect(visibilityFor(true, false)).toBe("full");
    expect(visibilityFor(true, true)).toBe("full");
    expect(visibilityFor(false, true)).toBe("read-only");
    expect(visibilityFor(false, false)).toBe("hidden");
  });
});
