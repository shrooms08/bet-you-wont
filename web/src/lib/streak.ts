// Streak constants and small pure helpers shared by client and server.

/** Cost of a streak freeze, in whole $wif tokens (burned on the token contract). */
export const FREEZE_COST_TOKENS = 2000;
export const FREEZE_COST_WEI = BigInt(FREEZE_COST_TOKENS) * BigInt("1000000000000000000");

/** From Thursday (UTC) on, a user with a streak whose current week hasn't qualified is "at risk". */
export function streakAtRisk(s: { currentStreak: number; weekQualified: boolean }, now: number): boolean {
  const day = new Date(now).getUTCDay(); // 0 = Sunday
  const lateInWeek = day === 0 || day >= 4; // Thu, Fri, Sat, Sun
  return s.currentStreak >= 1 && !s.weekQualified && lateInWeek;
}
