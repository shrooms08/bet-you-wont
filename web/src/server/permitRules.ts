// Who may get a permit for a PUBLIC wifie. Pure; unit-tested. Private wifies are unchanged
// (anyone holding the invite code).

/** A Privy account must be at least this old before it can join a public wifie. */
export const PUBLIC_MIN_ACCOUNT_AGE_MS = 10 * 60 * 1000;

export type PublicPermitCheck = "ok" | "blocked" | "too-new" | "other-wallet";

export const PUBLIC_PERMIT_ERRORS: Record<Exclude<PublicPermitCheck, "ok">, string> = {
  blocked: "Your profile can't join public wifies.",
  "too-new": "Your account is brand new. You can join the public wifie 10 minutes after signing up.",
  "other-wallet": "Only one wallet per account can join the public wifie, and yours already has.",
};

export function checkPublicPermit(p: {
  blocked: boolean;
  accountCreatedAt: number | null; // ms
  now: number;
  /** the wallet this account already got a public permit for, if any */
  existingWallet: string | null;
  wallet: string;
}): PublicPermitCheck {
  if (p.blocked) return "blocked";
  // unknown creation time counts as brand new (fail closed)
  if (p.accountCreatedAt === null || p.now - p.accountCreatedAt < PUBLIC_MIN_ACCOUNT_AGE_MS) return "too-new";
  if (p.existingWallet && p.existingWallet.toLowerCase() !== p.wallet.toLowerCase()) return "other-wallet";
  return "ok";
}
