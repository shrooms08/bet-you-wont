// Display helpers. Pure: unit-tested in format.test.ts.
import { formatUnits } from "viem";

/** Whole-token amount from wei, e.g. 5000000000000000000000n -> "5,000"; small amounts keep 2 decimals. */
export function formatWif(wei: bigint | string): string {
  return formatTokens(Number(formatUnits(BigInt(wei), 18)));
}

/** Same formatting for a plain token number (used by the count-up animation). */
export function formatTokens(tokens: number): string {
  if (tokens >= 100) return Math.round(tokens).toLocaleString("en-US");
  return tokens.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** "≈ $7", "≈ $0.42", "< $0.01". Null when there's no price. */
export function formatUsd(wei: bigint | string, usdPerToken: number | null | undefined): string | null {
  if (!usdPerToken) return null;
  const v = Number(formatUnits(BigInt(wei), 18)) * usdPerToken;
  if (v === 0) return "≈ $0";
  if (v < 0.01) return "< $0.01";
  if (v >= 10) return `≈ $${Math.round(v).toLocaleString("en-US")}`;
  return `≈ $${(Math.round(v * 100) / 100).toString()}`;
}

export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** "3d", "5h", "41m", "<1m". Null once the time has passed. */
export function timeLeft(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - now;
  if (!(ms > 0)) return null;
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** "25m ago", "2h ago", "yesterday", "4d ago". */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const m = Math.floor((now - Date.parse(iso)) / 60_000);
  if (!(m >= 0)) return null;
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

const LEADING_DARE = /^\s*(bet you won'?t|i dare you to|dare you to)\s+/i;
// A key phrase runs from the first word up to (not including) the first preposition, max 5 words.
const BREAK_WORDS = new Set(["to", "at", "in", "on", "for", "with", "as", "from", "into", "without", "while", "during", "until", "by", "near", "after", "before"]);

/**
 * Splits dare text for display: "bet you won't " + key (lime) + rest.
 * "sing happy birthday to a stranger" -> { key: "sing happy birthday", rest: " to a stranger" }.
 */
export function splitKeyPhrase(raw: string | null | undefined): { key: string; rest: string } {
  const text = (raw ?? "").replace(LEADING_DARE, "").trim().toLowerCase();
  if (!text) return { key: "", rest: "" };
  const words = text.split(/\s+/);
  let n = 1;
  while (n < words.length && n < 5 && !BREAK_WORDS.has(words[n])) n++;
  const key = words.slice(0, n).join(" ");
  const rest = words.length > n ? ` ${words.slice(n).join(" ")}` : "";
  return { key, rest };
}

/** The public group has no stored name on testnet; give it its brand name. */
export const PUBLIC_GROUP_ID = Number(process.env.NEXT_PUBLIC_PUBLIC_GROUP_ID ?? "1");
export const PUBLIC_GROUP_NAME = "world is flat";

export function groupName(id: number, name: string | null | undefined): string {
  if (name) return name;
  if (id === PUBLIC_GROUP_ID) return PUBLIC_GROUP_NAME;
  return `wifie #${id}`;
}

/** "@kemi" or "0x3b03…59ce" for wallets without a profile. */
export function handle(p: { wallet: string; username: string | null } | null | undefined): string {
  if (!p) return "anyone";
  return p.username ? `@${p.username}` : shortAddress(p.wallet);
}

/** Pulls an invite code out of a pasted link ("https://x/i/abc...") or returns the code itself. */
export function inviteCodeFrom(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const fromLink = trimmed.match(/\/i\/([a-z0-9]+)/);
  const code = fromLink ? fromLink[1] : trimmed;
  return /^[23456789abcdefghjkmnpqrstuvwxyz]{10}$/.test(code) ? code : null;
}
