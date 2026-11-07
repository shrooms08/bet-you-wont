import "server-only";
import { dareActions } from "./dareRules";
import { hiddenFor } from "./moderationRules";
import { matchProofs, type DareProofKey, type ProofRow } from "./proofMatch";
import { toPublic, type DareRow, type ProfileRow } from "./queries";
import { check, db } from "./supabase";

export type ProofInfo = {
  url: string;
  mime: string | null;
  kind: "photo" | "video" | null;
  posterUrl: string | null;
  capturedAt: string | null;
  durationMs: number | null;
};

/** Signed URLs live 1 hour; reuse one for up to 50 minutes so feeds polling every 20 s don't
 *  re-download the same media (each new URL is a new cache key in the browser). Per instance. */
const SIGNED_TTL_S = 3600;
const SIGNED_REUSE_MS = 50 * 60 * 1000;
const signedCache = new Map<string, { url: string; at: number }>();

/** Short-lived signed URLs for private proof objects (M-1). Missing objects map to nothing. */
export async function signedProofUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const now = Date.now();
  const need: string[] = [];
  for (const p of [...new Set(paths)]) {
    const hit = signedCache.get(p);
    if (hit && now - hit.at < SIGNED_REUSE_MS) out.set(p, hit.url);
    else need.push(p);
  }
  if (need.length) {
    const { data, error } = await db().storage.from("proofs").createSignedUrls(need, SIGNED_TTL_S);
    if (error) console.error("[proofs] signing:", error.message);
    for (const r of data ?? []) {
      if (!r.signedUrl || r.error || !r.path) continue;
      out.set(r.path, r.signedUrl);
      signedCache.set(r.path, { url: r.signedUrl, at: now });
    }
    if (signedCache.size > 2000) signedCache.clear();
  }
  return out;
}

/** Forget signed URLs for files that were just hidden or deleted. */
export function dropSignedUrls(paths: Array<string | null | undefined>) {
  for (const p of paths) if (p) signedCache.delete(p);
}

/**
 * Proof media per dare id, ONLY where the proof row was finalized for that exact dare by its doer
 * (H-2). URLs are short-lived signed URLs (M-1); callers must already have checked that the viewer
 * may see these dares.
 */
export async function proofsForDares(dares: DareProofKey[]): Promise<Map<number, ProofInfo>> {
  const map = new Map<number, ProofInfo>();
  const withProof = dares.filter((d) => d.proof_hash && d.doer_wallet);
  if (!withProof.length) return map;
  const rows = check(
    await db()
      .from("proofs")
      .select("proof_hash, dare_id, uploader_wallet, storage_path, mime, kind, poster_path, captured_at, duration_ms, deleted_at")
      .in("dare_id", [...new Set(withProof.map((d) => String(d.id)))]),
    "loading proofs",
  ) as ProofRow[];
  const matched = matchProofs(withProof, rows);
  const urls = await signedProofUrls([...matched.values()].flatMap((r) => [r.storage_path!, ...(r.poster_path ? [r.poster_path] : [])]));
  for (const [dareId, r] of matched) {
    const url = urls.get(r.storage_path!);
    if (!url) continue; // object gone: treat as missing
    map.set(dareId, {
      url,
      mime: r.mime,
      kind: r.kind ?? (r.mime?.startsWith("video/") ? "video" : "photo"),
      posterUrl: r.poster_path ? (urls.get(r.poster_path) ?? null) : null,
      capturedAt: r.captured_at,
      durationMs: r.duration_ms,
    });
  }
  return map;
}

/** "<dareId>:dare" / "<dareId>:proof" keys this wallet reported (hidden for them right away). */
export async function reportedBy(wallet: string, dareIds: number[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!wallet || !dareIds.length) return out;
  const rows = check(
    await db().from("reports").select("dare_id, target").eq("reporter_wallet", wallet.toLowerCase()).in("dare_id", dareIds),
    "loading your reports",
  ) as Array<{ dare_id: number; target: string }>;
  for (const r of rows) out.add(`${Number(r.dare_id)}:${r.target}`);
  return out;
}

/** 🔥 counts per dare and which of them this wallet reacted to. */
export async function reactionsFor(dareIds: number[], wallet: string) {
  const counts = new Map<number, number>();
  const mine = new Set<number>();
  if (!dareIds.length) return { counts, mine };
  const rows = check(
    await db().from("reactions").select("dare_id, wallet_address").in("dare_id", dareIds),
    "loading reactions",
  ) as Array<{ dare_id: number; wallet_address: string }>;
  const me = wallet.toLowerCase();
  for (const r of rows) {
    const id = Number(r.dare_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (r.wallet_address === me) mine.add(id);
  }
  return { counts, mine };
}

/** dare ids (of the given ones) this wallet has voted on. */
export async function votedDareIds(wallet: string, dareIds: number[]) {
  if (!dareIds.length) return new Set<number>();
  const rows = check(
    await db().from("votes").select("dare_id").eq("voter_wallet", wallet.toLowerCase()).in("dare_id", dareIds),
    "loading votes",
  ) as Array<{ dare_id: number }>;
  return new Set(rows.map((r) => Number(r.dare_id)));
}

const READ_ONLY = { canAccept: false, canSubmitProof: false, canVote: false, canSettle: false, canCancel: false, settleOutcome: "None" as const };

export type DareViewInput = {
  dares: DareRow[];
  viewer: string; // lowercased wallet
  /** the viewer's join index per group (vote eligibility: joinIndex <= dare.voter_snapshot) */
  joinIndexByGroup: Map<number, number | null>;
  voted: Set<number>;
  profiles: Map<string, ProfileRow>;
  /** proof media by dare id (from proofsForDares) */
  proofs: Map<number, ProofInfo>;
  /** keys "<dareId>:dare|proof" the viewer reported: hidden for them immediately */
  viewerReports?: Set<string>;
  groupNames?: Map<number, string | null>;
  reactions?: { counts: Map<number, number>; mine: Set<number> };
  /** groups where the viewer is NOT a member: their action flags are all false (read-only) */
  readOnlyGroups?: Set<number>;
  now?: number;
};

export function buildDareViews(input: DareViewInput) {
  const now = input.now ?? Date.now();
  const person = (w: string | null) => (w ? toPublic(w, input.profiles.get(w)) : null);
  return input.dares.map((d) => {
    const actions = dareActions(
      d,
      {
        wallet: input.viewer,
        joinIndex: input.joinIndexByGroup.get(Number(d.group_id)) ?? null,
        hasVoted: input.voted.has(Number(d.id)),
      },
      now,
    );
    const hidden = hiddenFor(d, input.viewerReports ?? new Set());
    const proof = hidden.mediaHidden ? undefined : input.proofs.get(Number(d.id));
    return {
      id: Number(d.id),
      groupId: Number(d.group_id),
      groupName: input.groupNames?.get(Number(d.group_id)) ?? undefined,
      text: hidden.textHidden ? null : d.text,
      textHidden: hidden.textHidden,
      mediaHidden: hidden.mediaHidden && !!d.proof_hash,
      creator: person(d.creator_wallet),
      target: person(d.target_wallet),
      doer: person(d.doer_wallet),
      amount: d.amount,
      payout: d.payout,
      burned: d.burned,
      state: d.state,
      outcome: d.outcome,
      doDuration: d.do_duration,
      voteWindow: d.vote_window,
      acceptedAt: d.accepted_at,
      proofDeadline: d.proof_deadline,
      voteEnd: d.vote_end,
      eligible: d.eligible,
      voterSnapshot: d.voter_snapshot ?? null,
      passVotes: d.pass_votes,
      failVotes: d.fail_votes,
      proofHash: d.proof_hash,
      proofUrl: proof?.url ?? null,
      proofMime: proof?.mime ?? null,
      proofKind: proof?.kind ?? null,
      posterUrl: proof?.posterUrl ?? null,
      capturedAt: proof?.capturedAt ?? null,
      durationMs: proof?.durationMs ?? null,
      reactionCount: input.reactions?.counts.get(Number(d.id)) ?? 0,
      reacted: input.reactions?.mine.has(Number(d.id)) ?? false,
      proofAt: d.proof_at ?? null,
      settledAt: d.settled_at ?? null,
      activityAt: d.activity_at ?? null,
      createdAt: d.created_at,
      createdTx: d.created_tx,
      settledTx: d.settled_tx,
      hasVoted: input.voted.has(Number(d.id)),
      ...(input.readOnlyGroups?.has(Number(d.group_id)) ? READ_ONLY : actions),
    };
  });
}
