import "server-only";
import type { Caller } from "./auth";
import { ApiError } from "./http";
import { check, db } from "./supabase";
import { ageGate } from "./visibility";

/**
 * Write routes call this: the caller needs a profile with the 18+ confirmation.
 * `allowNoProfile` is for onboarding steps that run before the profile exists (avatar upload).
 */
export async function requireAdult(caller: Caller, opts: { allowNoProfile?: boolean } = {}) {
  const rows = check(
    await db().from("profiles").select("age_confirmed_at").eq("privy_user_id", caller.userId).limit(1),
    "loading profile",
  ) as Array<{ age_confirmed_at: string | null }>;
  const gate = ageGate(rows[0] ?? null);
  if (gate === "ok" || (gate === "no-profile" && opts.allowNoProfile)) return;
  if (gate === "no-profile") throw new ApiError(403, "set up your @name first.");
  throw new ApiError(403, "confirm you're 18+");
}
