import "server-only";
import type { Caller } from "./auth";
import { ApiError } from "./http";

/** Wallets listed in ADMIN_WALLETS (server-only env, comma separated), lowercased. */
export function adminWallets(env: string | undefined = process.env.ADMIN_WALLETS): Set<string> {
  return new Set(
    (env ?? "")
      .split(",")
      .map((w) => w.trim().toLowerCase())
      .filter((w) => /^0x[0-9a-f]{40}$/.test(w)),
  );
}

/** True if any of the caller's linked wallets is an admin wallet. */
export function isAdmin(caller: Pick<Caller, "wallets">, env?: string): boolean {
  const admins = adminWallets(env);
  return caller.wallets.some((w) => admins.has(w.toLowerCase()));
}

/** Throws 403 unless the caller is an admin (404-style message: don't advertise the page). */
export function requireAdmin(caller: Caller): void {
  if (!isAdmin(caller)) throw new ApiError(403, "Not found.");
}
