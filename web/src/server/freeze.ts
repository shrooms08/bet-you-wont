// Streak-freeze burn validation. Pure; unit-tested.
import { isoWeekKey, shiftWeek, weekEndMs, weekStartMs } from "@/lib/isoWeek";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const ZERO = "0x0000000000000000000000000000000000000000";

export type TransferLog = { token: string; from: string; to: string; value: bigint };
export type FreezeCheck =
  | "ok"
  | "wrong-token" // no Transfer from the $wif token contract
  | "not-burn" // nothing sent to 0x0
  | "wrong-sender" // the burn wasn't from one of your wallets
  | "too-small"
  | "reused-tx"
  | "wrong-week" // only last week or this week
  | "already-frozen" // one freeze per ISO week
  | "stale-burn"; // L-4: burned too long ago, or before your previous qualifying week

export const FREEZE_ERRORS: Record<Exclude<FreezeCheck, "ok">, string> = {
  "wrong-token": "That transaction didn't burn $wif.",
  "not-burn": "That transaction didn't burn anything (nothing went to the zero address).",
  "wrong-sender": "That burn didn't come from one of your wallets.",
  "too-small": "A streak freeze burns at least 2,000 $wif.",
  "reused-tx": "That burn was already used for a streak freeze.",
  "wrong-week": "You can only save last week or this week.",
  "already-frozen": "You already saved that week.",
  "stale-burn": "That burn is too old to save this week. Burn again to save it.",
};

export function checkFreeze(p: {
  transfers: TransferLog[];
  token: string;
  linkedWallets: string[];
  minAmount: bigint;
  txAlreadyUsed: boolean;
  weeksAlreadyFrozen: string[];
  week: string;
  now: number;
  /** when the burn was mined (block timestamp, ms) */
  burnedAt: number;
  /** weeks this user's wallets already qualified (scoring) */
  qualifiedWeeks: string[];
}): { result: FreezeCheck; from?: string; amount?: bigint } {
  if (p.txAlreadyUsed) return { result: "reused-tx" };
  const thisWeek = isoWeekKey(p.now);
  if (p.week !== thisWeek && p.week !== shiftWeek(thisWeek, -1)) return { result: "wrong-week" };
  if (p.weeksAlreadyFrozen.includes(p.week)) return { result: "already-frozen" };
  // L-4: the burn must be mined within the week it saves or the last 7 days, and after the
  // previous week that qualified (so one old burn can't be saved up and reused later)
  const inWeek = p.burnedAt >= weekStartMs(p.week) && p.burnedAt < weekEndMs(p.week);
  const recent = p.burnedAt <= p.now && p.now - p.burnedAt <= WEEK_MS;
  if (!inWeek && !recent) return { result: "stale-burn" };
  const previous = p.qualifiedWeeks.filter((w) => w < p.week).sort().pop();
  if (previous && p.burnedAt < weekEndMs(previous)) return { result: "stale-burn" };
  const token = p.token.toLowerCase();
  const mine = new Set(p.linkedWallets.map((w) => w.toLowerCase()));
  const fromToken = p.transfers.filter((t) => t.token.toLowerCase() === token);
  if (!fromToken.length) return { result: "wrong-token" };
  const burns = fromToken.filter((t) => t.to.toLowerCase() === ZERO);
  if (!burns.length) return { result: "not-burn" };
  const ours = burns.filter((t) => mine.has(t.from.toLowerCase()));
  if (!ours.length) return { result: "wrong-sender" };
  const best = ours.reduce((a, b) => (b.value > a.value ? b : a));
  if (best.value < p.minAmount) return { result: "too-small" };
  return { result: "ok", from: best.from.toLowerCase(), amount: best.value };
}
