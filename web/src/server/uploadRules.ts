// Upload budgets (AUDIT.md M-4). Pure; unit-tested.

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Proof bytes a user may request per rolling 24 h (retakes count: deleting doesn't refund). */
export const PROOF_BYTES_PER_DAY = 300 * 1024 * 1024;
/** Avatar uploads a user may request per rolling 24 h. */
export const AVATAR_UPLOADS_PER_DAY = 10;

export type UploadLedgerRow = { kind: "proof" | "avatar"; declared_bytes: number | string; created_at: string };
export type BudgetCheck = "ok" | "proof-budget" | "avatar-budget";

export const BUDGET_ERRORS: Record<Exclude<BudgetCheck, "ok">, string> = {
  "proof-budget": "You've uploaded 300 MB of proof today. Try again tomorrow.",
  "avatar-budget": "That's 10 profile pictures today. Try again tomorrow.",
};

export function checkUploadBudget(kind: "proof" | "avatar", size: number, recent: UploadLedgerRow[], now: number): BudgetCheck {
  const today = recent.filter((r) => r.kind === kind && now - Date.parse(r.created_at) < DAY_MS);
  if (kind === "avatar") return today.length >= AVATAR_UPLOADS_PER_DAY ? "avatar-budget" : "ok";
  const used = today.reduce((a, r) => a + Number(r.declared_bytes), 0);
  return used + size > PROOF_BYTES_PER_DAY ? "proof-budget" : "ok";
}

/** Storage objects older than `ageMs` that nothing references any more (daily cleanup). */
export function staleObjects(objects: Array<{ path: string; createdAt: string | null }>, keep: Set<string>, now: number, ageMs = DAY_MS): string[] {
  return objects
    .filter((o) => !keep.has(o.path))
    .filter((o) => o.createdAt !== null && now - Date.parse(o.createdAt) > ageMs)
    .map((o) => o.path);
}
