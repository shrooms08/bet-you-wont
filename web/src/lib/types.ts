// Response shapes of our API routes (see PHASE3C1_REPORT.md). Shared by the app, the dev harness
// and the ?mock=1 fixtures.

export type PublicProfile = { wallet: string; username: string | null; avatarUrl: string | null; ringColor: string | null };

export type MyGroup = {
  id: number;
  name: string | null;
  isPublic: boolean;
  isCreator: boolean;
  inviteCode: string | null;
  memberCount: number;
  liveDareCount: number;
  members?: PublicProfile[]; // up to 5, for avatar stacks
};

export type Me = { wallet: string; wallets: string[]; profile: PublicProfile | null; groups: MyGroup[] };

export type DareView = {
  id: number;
  groupId: number;
  groupName?: string | null;
  text: string | null;
  creator: PublicProfile | null;
  target: PublicProfile | null;
  doer: PublicProfile | null;
  amount: string;
  payout: string | null;
  burned: string | null;
  state: string;
  outcome: string;
  doDuration: number;
  voteWindow: number;
  acceptedAt?: string | null;
  proofDeadline: string | null;
  voteEnd: string | null;
  eligible: number | null;
  passVotes: number;
  failVotes: number;
  proofUrl: string | null;
  proofMime: string | null;
  createdAt?: string | null;
  createdTx: string | null;
  settledTx: string | null;
  hasVoted: boolean;
  canAccept: boolean;
  canSubmitProof: boolean;
  canVote: boolean;
  canSettle: boolean;
  canCancel: boolean;
  settleOutcome: string;
};

export type FeedStats = { memberCount: number; openDares: number; liveDares: number; paidOut: string; refunded: string; burned: string };

export type Feed = {
  viewer: string;
  group: { id: number; name: string | null; isPublic: boolean; creator: PublicProfile; inviteCode: string | null; createdAt?: string | null };
  members: Array<PublicProfile & { joinedAt: string | null }>;
  stats: FeedStats;
  dares: DareView[];
};

export type Home = {
  wallet: string;
  waitingOnYou: { toAccept: DareView[]; toVote: DareView[]; needsProof: DareView[]; toSettle: DareView[] };
  groups: MyGroup[];
};

export type InvitePreview = { groupId: number; name: string | null; isPublic: boolean; memberCount: number; creator: PublicProfile };

export type PublicGroup = {
  groupId: number;
  name: string | null;
  memberCount: number;
  openDares: number;
  votingDares: number;
  members: PublicProfile[];
};

export type Price = { usd: number | null; source: string | null; fetchedAt?: string };
