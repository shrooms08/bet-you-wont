import "server-only";
import { dareActions } from "./dareRules";
import { toPublic, type DareRow, type ProfileRow } from "./queries";
import { check, db, publicUrl } from "./supabase";

/** Proof file (public URL + mime) for each proof hash. */
export async function proofsByHash(hashes: Array<string | null>) {
  const list = [...new Set(hashes.filter((h): h is string => !!h))];
  const map = new Map<string, { url: string; mime: string | null }>();
  if (!list.length) return map;
  const rows = check(
    await db().from("proofs").select("proof_hash, storage_path, mime").in("proof_hash", list),
    "loading proofs",
  ) as Array<{ proof_hash: string; storage_path: string; mime: string | null }>;
  for (const r of rows) map.set(r.proof_hash, { url: publicUrl("proofs", r.storage_path), mime: r.mime });
  return map;
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

export type DareViewInput = {
  dares: DareRow[];
  viewer: string; // lowercased wallet
  joinedAtByGroup: Map<number, string | null>;
  voted: Set<number>;
  profiles: Map<string, ProfileRow>;
  proofs: Map<string, { url: string; mime: string | null }>;
  groupNames?: Map<number, string | null>;
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
      createdAt: d.created_at,
      createdTx: d.created_tx,
      settledTx: d.settled_tx,
      hasVoted: input.voted.has(Number(d.id)),
      ...actions,
    };
  });
}
