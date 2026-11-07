import { describe, expect, it } from "vitest";
import { FREEZE_COST_TOKENS, FREEZE_COST_WEI, streakAtRisk } from "./streak";

const at = (iso: string) => Date.parse(iso);

describe("streak at risk banner", () => {
  const live = { currentStreak: 2, weekQualified: false };
  it("shows Thursday through Sunday (UTC) when the week hasn't qualified", () => {
    expect(streakAtRisk(live, at("2026-11-05T00:00:00Z"))).toBe(true); // Thu 00:00 UTC
    expect(streakAtRisk(live, at("2026-11-07T12:00:00Z"))).toBe(true); // Sat
    expect(streakAtRisk(live, at("2026-11-08T23:59:59Z"))).toBe(true); // Sun, last second of the ISO week
  });
  it("stays hidden Monday to Wednesday, once the week qualifies, or with no streak", () => {
    expect(streakAtRisk(live, at("2026-11-04T23:59:59Z"))).toBe(false); // Wed
    expect(streakAtRisk(live, at("2026-11-09T00:00:00Z"))).toBe(false); // Mon, new week
    expect(streakAtRisk({ currentStreak: 2, weekQualified: true }, at("2026-11-07T12:00:00Z"))).toBe(false);
    expect(streakAtRisk({ currentStreak: 0, weekQualified: false }, at("2026-11-07T12:00:00Z"))).toBe(false);
  });
  it("freeze cost is one constant: 2,000 $wif in wei", () => {
    expect(FREEZE_COST_TOKENS).toBe(2000);
    expect(FREEZE_COST_WEI).toBe(BigInt(2000) * BigInt(10) ** BigInt(18));
  });
});
