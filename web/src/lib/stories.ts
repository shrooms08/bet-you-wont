// "Stories" row on home: one bubble per dare that is waiting on you. Pure; unit-tested.
import type { DareView, Home, PublicProfile } from "./types";

export type StoryKind = "proof" | "vote" | "settle" | "accept";
export type Story = { kind: StoryKind; dare: DareView; person: PublicProfile | null; label: string; ring: string };

// Ring colors per type (bubble ring around the relevant person's avatar).
export const STORY_RING: Record<StoryKind, string> = {
  accept: "var(--byw-primary)", // lime
  vote: "var(--byw-accent)", // violet
  proof: "var(--byw-danger)", // orange
  settle: "var(--byw-text)", // cream
};
const LABEL: Record<StoryKind, string> = { accept: "accept", vote: "vote", proof: "proof", settle: "settle" };
// Most urgent first: your own proof (a clock is running on you), then votes, settles, accepts.
const ORDER: StoryKind[] = ["proof", "vote", "settle", "accept"];

const deadline = (k: StoryKind, d: DareView) =>
  Date.parse((k === "proof" ? d.proofDeadline : k === "vote" ? d.voteEnd : null) ?? "") || Number.MAX_SAFE_INTEGER;

/** One bubble per dare (most urgent action wins), ordered by type then soonest deadline. */
export function storiesFrom(w: Home["waitingOnYou"] | undefined): Story[] {
  if (!w) return [];
  const lists: Record<StoryKind, DareView[]> = { proof: w.needsProof, vote: w.toVote, settle: w.toSettle, accept: w.toAccept };
  const seen = new Set<number>();
  const out: Story[] = [];
  for (const kind of ORDER) {
    const sorted = [...lists[kind]].sort((a, b) => deadline(kind, a) - deadline(kind, b));
    for (const dare of sorted) {
      if (seen.has(dare.id)) continue;
      seen.add(dare.id);
      const person = kind === "vote" ? dare.doer : kind === "proof" ? dare.creator : dare.creator;
      out.push({ kind, dare, person, label: LABEL[kind], ring: STORY_RING[kind] });
    }
  }
  return out;
}
