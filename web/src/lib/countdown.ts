// Countdown math for the ACCEPTED circle. Pure; unit-tested.

/** Fraction of the time window used so far, clamped 0..1. */
export function fractionUsed(startIso: string | null | undefined, endIso: string | null | undefined, now: number): number {
  if (!startIso || !endIso) return 0;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!(end > start)) return 1;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/** Big readout: "23 HR 12 MINS", "3 DAYS 4 HR", "12 MINS", "45 SECS", "TIME'S UP". */
export function readout(endIso: string | null | undefined, now: number): string {
  if (!endIso) return "";
  const ms = Date.parse(endIso) - now;
  if (!(ms > 0)) return "TIME'S UP";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (d >= 1) return `${plural(d, "DAY", "DAYS")} ${h} HR`;
  if (h >= 1) return `${h} HR ${plural(m, "MIN", "MINS")}`;
  if (m >= 1) return plural(m, "MIN", "MINS");
  return plural(s, "SEC", "SECS");
}

/** Short form for the curved label: "23h", "41m", "3d". */
export function shortLeft(endIso: string | null | undefined, now: number): string {
  if (!endIso) return "";
  const ms = Date.parse(endIso) - now;
  if (!(ms > 0)) return "0m";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
