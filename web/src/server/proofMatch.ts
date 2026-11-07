// Which proof file belongs to which dare. Pure; unit-tested (AUDIT.md H-2).
//
// A dare's onchain proofHash is chosen by whoever calls submitProof, so it can be copied from any
// other dare. A proof file is therefore shown for a dare ONLY when its row was finalized for that
// exact dare (dare_id), by that dare's doer (uploader_wallet), with the same hash. Anything else is
// treated as "proof missing": no media at all.

export type ProofRow = {
  proof_hash: string;
  dare_id: number | string | null;
  uploader_wallet: string | null;
  storage_path: string | null;
  mime: string | null;
  kind: "photo" | "video" | null;
  poster_path: string | null;
  captured_at: string | null;
  duration_ms: number | null;
  deleted_at?: string | null;
};

export type DareProofKey = { id: number | string; proof_hash: string | null; doer_wallet: string | null };

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** True if `row` is the finalized proof of `dare`. */
export function proofBelongsTo(row: ProofRow, dare: DareProofKey): boolean {
  if (!dare.proof_hash || !dare.doer_wallet || !row.storage_path || row.deleted_at) return false;
  return (
    lower(row.proof_hash) === lower(dare.proof_hash) &&
    String(row.dare_id) === String(dare.id) &&
    lower(row.uploader_wallet) === lower(dare.doer_wallet)
  );
}

/** dareId -> its proof row, for the dares whose proof is legitimately theirs. */
export function matchProofs(dares: DareProofKey[], rows: ProofRow[]): Map<number, ProofRow> {
  const byDare = new Map<string, ProofRow[]>();
  for (const r of rows) {
    const k = String(r.dare_id);
    if (!byDare.has(k)) byDare.set(k, []);
    byDare.get(k)!.push(r);
  }
  const out = new Map<number, ProofRow>();
  for (const d of dares) {
    const hit = (byDare.get(String(d.id)) ?? []).find((r) => proofBelongsTo(r, d));
    if (hit) out.set(Number(d.id), hit);
  }
  return out;
}
