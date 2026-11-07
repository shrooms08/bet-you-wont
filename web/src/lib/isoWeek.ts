// ISO-8601 weeks in UTC ("2026-W45"). Weeks start Monday 00:00 UTC. Pure; unit-tested.
const DAY = 86_400_000;

export function isoWeekKey(d: Date | number): string {
  const t = typeof d === "number" ? new Date(d) : d;
  const date = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const day = date.getUTCDay() || 7; // Mon=1 .. Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - day); // the Thursday of this week decides the year
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / DAY + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function parseWeek(key: string): { year: number; week: number } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  return week >= 1 && week <= 53 ? { year, week } : null;
}

/** Monday 00:00 UTC of the ISO week, in ms. */
export function weekStartMs(key: string): number {
  const p = parseWeek(key);
  if (!p) throw new Error(`bad ISO week: ${key}`);
  const jan4 = Date.UTC(p.year, 0, 4);
  const jan4Day = new Date(jan4).getUTCDay() || 7;
  const mondayOfWeek1 = jan4 - (jan4Day - 1) * DAY;
  return mondayOfWeek1 + (p.week - 1) * 7 * DAY;
}

export function weekEndMs(key: string): number {
  return weekStartMs(key) + 7 * DAY;
}

/** The ISO week n weeks after (or before, for negative n) the given one. */
export function shiftWeek(key: string, n: number): string {
  return isoWeekKey(weekStartMs(key) + n * 7 * DAY + DAY); // +1 day: safely inside the week
}
