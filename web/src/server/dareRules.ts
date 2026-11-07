// What a wallet can do with a dare right now, computed from a synced `dares` row.
// Mirrors BYWEscrow (v2) _resolve / _outcomeOf / vote() checks. The contract stays the source of truth:
// these flags only decide which buttons the UI shows, and every action is simulated before sending.

export const DARE_STATES = ["None", "Open", "Accepted", "Voting", "Settled", "Cancelled"] as const;
export const OUTCOMES = ["None", "Passed", "Failed", "Expired", "NoVotes"] as const;
export type DareStateName = (typeof DARE_STATES)[number];
export type OutcomeName = (typeof OUTCOMES)[number];

export type DareLike = {
  state: string | null;
  creator_wallet: string | null;
  target_wallet: string | null;
  doer_wallet: string | null;
  proof_deadline: string | null;
  vote_end: string | null;
  vote_window: number | null;
  eligible: number | null;
  /** group member count when the dare was created (v2): voters need join index <= this */
  voter_snapshot?: number | null;
  pass_votes: number | null;
  fail_votes: number | null;
};

const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

/** Same rules as the contract's `resolvable()`. `now` is in ms. */
export function resolveDare(d: DareLike, now: number): { canSettle: boolean; outcome: OutcomeName } {
  if (d.state === "Accepted") {
    if (now > ms(d.proof_deadline)) return { canSettle: true, outcome: "Expired" };
  } else if (d.state === "Voting") {
    const eligible = d.eligible ?? 0;
    const pass = d.pass_votes ?? 0;
    const fail = d.fail_votes ?? 0;
    if (pass * 2 >= eligible) return { canSettle: true, outcome: "Passed" };
    if (fail * 2 > eligible) return { canSettle: true, outcome: "Failed" };
    if (now > ms(d.vote_end)) {
      if (pass + fail === 0) return { canSettle: true, outcome: "NoVotes" }; // creator refunded 100%
      return { canSettle: true, outcome: pass >= fail ? "Passed" : "Failed" };
    }
  }
  return { canSettle: false, outcome: "None" };
}

export type ViewerContext = {
  wallet: string; // lowercased
  joinIndex: number | null; // this wallet's 1-based join order in the dare's group (null: unknown)
  hasVoted: boolean;
};

export type DareActions = {
  canAccept: boolean;
  canSubmitProof: boolean;
  canVote: boolean;
  canSettle: boolean;
  canCancel: boolean;
  settleOutcome: OutcomeName;
};

/** Buttons to show this viewer for this dare. Assumes the viewer is a member of the dare's group. */
export function dareActions(d: DareLike, v: ViewerContext, now: number): DareActions {
  const me = v.wallet.toLowerCase();
  const isCreator = d.creator_wallet === me;
  const isDoer = d.doer_wallet === me;
  const resolution = resolveDare(d, now);

  const canAccept = d.state === "Open" && !isCreator && (d.target_wallet === null || d.target_wallet === me);
  const canSubmitProof = d.state === "Accepted" && isDoer && now <= ms(d.proof_deadline);
  // Voters must have joined by the time the dare was created (contract: joinIndex <= voterSnapshot).
  const inSnapshot = v.joinIndex !== null && d.voter_snapshot != null && v.joinIndex <= d.voter_snapshot;
  const canVote =
    d.state === "Voting" && now <= ms(d.vote_end) && !isCreator && !isDoer && inSnapshot && !v.hasVoted;
  const canCancel = d.state === "Open" && isCreator;

  return {
    canAccept,
    canSubmitProof,
    canVote,
    canSettle: resolution.canSettle,
    canCancel,
    settleOutcome: resolution.outcome,
  };
}

/** Dares that still need something from someone. */
export const LIVE_STATES: readonly string[] = ["Open", "Accepted", "Voting"];
