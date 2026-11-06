import "server-only";
import { dareActions } from "./dareRules";
import { toPublic, type DareRow, type ProfileRow } from "./queries";
import { check, db, publicUrl } from "./supabase";

export type ProofInfo = {
  url: string;
  mime: string | null;
  kind: "photo" | "video" | null;
  posterUrl: string | null;
  capturedAt: string | null;
  durationMs: number | null;
};

/** Proof file (public URL, mime, kind, poster, capture time) for each proof hash. */
export async function proofsByHash(hashes: Array<string | null>) {
  const list = [...new Set(hashes.filter((h): h is string => !!h))];
  const map = new Map<string, ProofInfo>();
  if (!list.length) return map;
  const rows = check(
    await db()
      .from("proofs")
      .select("proof_hash, storage_path, mime, kind, poster_path, captured_at, duration_ms")
      .in("proof_hash", list),
    "loading proofs",
  ) as Array<{
    proof_hash: string;
    storage_path: string;
    mime: string | null;
    kind: "photo" | "video" | null;
    poster_path: string | null;
    captured_at: string | null;
    duration_ms: number | null;
  }>;
  for (const r of rows) {
    map.set(r.proof_hash, {
      url: publicUrl("proofs", r.storage_path),
      mime: r.mime,
      kind: r.kind ?? (r.mime?.startsWith("video/") ? "video" : "photo"),
      posterUrl: r.poster_path ? publicUrl("proofs", r.poster_path) : null,
      capturedAt: r.captured_at,
      durationMs: r.duration_ms,
    });
  }
  return map;
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
  joinedAtByGroup: Map<number, string | null>;
  voted: Set<number>;
  profiles: Map<string, ProfileRow>;
  proofs: Map<string, ProofInfo>;
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
        joinedAt: input.joinedAtByGroup.get(Number(d.group_id)) ?? null,
        hasVoted: input.voted.has(Number(d.id)),
      },
      now,
    );
    const proof = d.proof_hash ? input.proofs.get(d.proof_hash) : undefined;
    return {
      id: Number(d.id),
      groupId: Number(d.group_id),
      groupName: input.groupNames?.get(Number(d.group_id)) ?? undefined,
      text: d.text,
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
