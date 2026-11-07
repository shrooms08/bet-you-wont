// Proof capture sessions: pure rules (unit-tested). The route does the I/O.
import { randomInt } from "node:crypto";

export const SESSION_TTL_MS = 15 * 60 * 1000;
/** Unambiguous uppercase: no 0/O, 1/I/L. */
export const SESSION_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newSessionCode(len = 6): string {
  let out = "";
  for (let i = 0; i < len; i++) out += SESSION_ALPHABET[randomInt(SESSION_ALPHABET.length)];
  return out;
}

export type SessionRow = {
  id: string;
  dare_id: number | string;
  wallet_address: string;
  privy_user_id: string;
  code: string;
  issued_at: string;
  expires_at: string;
  used_at?: string | null;
};

export type SessionCheck = "ok" | "missing" | "wrong-dare" | "wrong-user" | "expired" | "used";

/** Is this session usable to finalize proof for `dareId` by this user/wallet at `now`? */
export function checkSession(
  s: SessionRow | null | undefined,
  ctx: { dareId: bigint | number; wallet: string; userId: string; now: number },
): SessionCheck {
  if (!s) return "missing";
  if (String(s.dare_id) !== String(ctx.dareId)) return "wrong-dare";
  if (s.wallet_address !== ctx.wallet.toLowerCase() || s.privy_user_id !== ctx.userId) return "wrong-user";
  if (Date.parse(s.expires_at) <= ctx.now) return "expired";
  if (s.used_at) return "used"; // L-3: one proof per capture session
  return "ok";
}

export const SESSION_ERRORS: Record<Exclude<SessionCheck, "ok">, string> = {
  missing: "That capture session doesn't exist. Open the camera again.",
  "wrong-dare": "That capture was made for a different dare.",
  "wrong-user": "That capture session belongs to someone else.",
  expired: "That capture session expired (15 minutes). Take the proof again.",
  used: "That capture session was already used. Open the camera again.",
};
