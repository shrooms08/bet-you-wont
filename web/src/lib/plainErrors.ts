import { describeError } from "./errors";

// Escrow custom errors and common wallet failures, in plain words for toasts.
const CONTRACT_ERRORS: Record<string, string> = {
  GroupNotFound: "that wifie doesn't exist.",
  AlreadyMember: "you're already in this wifie.",
  NotMember: "you need to be in this wifie first.",
  PermitExpired: "that invite expired. try joining again.",
  InvalidPermitSigner: "that invite isn't valid. ask for a fresh link.",
  GroupTooSmall: "a wifie needs at least 3 people before anyone can dare.",
  InvalidTarget: "you can't dare that person here.",
  AmountOutOfRange: "that bounty is too small or too big.",
  InvalidDoDuration: "pick between 1 hour and 7 days to do it.",
  InvalidVoteWindow: "pick a vote window of 15 min, 1h, 6h or 24h.",
  InvalidState: "this dare has already moved on. refresh and try again.",
  NotDareCreator: "only the person who made this dare can do that.",
  CreatorCannotAccept: "you can't take your own dare.",
  NotTarget: "this dare is for someone else.",
  NotDoer: "only the person who took the dare can post proof.",
  ProofDeadlinePassed: "time's up for posting proof.",
  VotingClosed: "voting already closed.",
  AlreadyVoted: "you already voted on this one.",
  DoerCannotVote: "you can't vote on your own dare.",
  CreatorCannotVote: "you made this dare, so your friends decide.",
  NotEligibleVoter: "you joined after the proof went up, so you can't vote on this one.",
  NotResolvable: "it's not ready to settle yet.",
  EnforcedPause: "daring is paused for a moment. try again soon.",
  ERC20InsufficientBalance: "you don't have enough $wif for that.",
  ERC20InsufficientAllowance: "approve $wif first, then try again.",
};

/** One short, lowercase sentence for a failed action. */
export function plainError(err: unknown): string {
  const raw = describeError(err);
  const name = raw.match(/Reverted: (\w+)/)?.[1];
  if (name && CONTRACT_ERRORS[name]) return CONTRACT_ERRORS[name];
  const lower = raw.toLowerCase();
  if (lower.includes("rejected")) return "you cancelled it in your wallet.";
  if (lower.includes("insufficient funds") || lower.includes("exceeds the balance")) {
    return "you need a little ETH for gas. top up and try again.";
  }
  if (lower.includes("→ 429") || lower.includes("too many")) return "slow down a sec, then try again.";
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("timed out") || lower.includes("rpc")) {
    return "couldn't reach the network. try again.";
  }
  // API errors come back as "/api/x → 403: message"
  const api = raw.match(/→ \d{3}: (.+)$/)?.[1];
  if (api) return api.charAt(0).toLowerCase() + api.slice(1);
  return raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;
}
