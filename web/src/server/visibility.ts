// Who can see a dare. Pure; unit-tested. (crewAccess in access.ts does the lookups.)
export type Visibility = "full" | "read-only" | "hidden";

/** Members see everything; anyone sees public wifies read-only; private wifies are hidden. */
export function visibilityFor(member: boolean, isPublic: boolean): Visibility {
  if (member) return "full";
  return isPublic ? "read-only" : "hidden";
}

/** The 18+ gate for write routes. */
export type AgeGate = "ok" | "no-profile" | "unconfirmed";
export function ageGate(profile: { age_confirmed_at: string | null } | null | undefined): AgeGate {
  if (!profile) return "no-profile";
  return profile.age_confirmed_at ? "ok" : "unconfirmed";
}

/** POST /api/profile: creating a profile needs ageConfirmed; existing unconfirmed ones confirm here. */
export function profileAgeDecision(existing: { age_confirmed_at: string | null } | null, ageConfirmed: boolean | undefined) {
  if (existing?.age_confirmed_at) return { ok: true as const, setAge: false };
  if (ageConfirmed === true) return { ok: true as const, setAge: true };
  return { ok: false as const };
}
