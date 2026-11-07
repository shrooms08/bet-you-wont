// Response shapes of our API routes (see PHASE3C1_REPORT.md). Shared by the app, the dev harness
// and the ?mock=1 fixtures.

export type PublicProfile = { wallet: string; username: string | null; avatarUrl: string | null; ringColor: string | null; streak?: number };

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

/** Dare Score + streak stats (wei amounts as decimal strings). */
export type Stats = {
  score: number;
  scoreWeek: number;
  currentStreak: number;
  bestStreak: number;
  weekQualified: boolean;
  daresDone: number;
  daresDared: number;
  wifWon: string;
  wifBurned: string;
  freezeOffer: { week: string; streak: number } | null;
};

export type Me = {
  wallet: string;
  wallets: string[];
  profile: (PublicProfile & { ageConfirmed?: boolean }) | null;
  groups: MyGroup[];
  stats?: Stats;
};

export type ProofTile = { dareId: number; state: string; outcome: string; kind: "photo" | "video" | null; thumb: string | null };
export type UserPage = { me: boolean; profile: PublicProfile; stats: Stats; did: ProofTile[]; dared: ProofTile[] };
export type LeaderRow = { rank: number; points: number; person: PublicProfile };
export type Leaderboard = { period: "week" | "all"; rows: LeaderRow[] };
export type HistoryItem =
  | { type: "dare"; dareId: number; text: string | null; role: "creator" | "doer"; outcome: string; kind: "won" | "refunded" | "lost" | "none"; amount: string; burned: string; tx: string | null; at: string | null }
  | { type: "freeze"; week: string; amount: string; tx: string; at: string };

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
  // 3c-2b-1
  proofKind?: "photo" | "video" | null;
  posterUrl?: string | null;
  capturedAt?: string | null;
  durationMs?: number | null;
  reactionCount?: number;
  reacted?: boolean;
  proofAt?: string | null;
  settledAt?: string | null;
  activityAt?: string | null;
  /** v2: group member count when the dare was created (only those members can vote) */
  voterSnapshot?: number | null;
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

/** GET /api/feed item: a media post (proof) or a challenge post (open dare). */
export type FeedItem = DareView & { post: "media" | "challenge"; member: boolean };
export type FeedPage = { items: FeedItem[]; nextCursor: string | null };

/** GET /api/dares/<id> */
export type DareDetail = {
  viewer: string;
  myPoints?: number;
  member: boolean;
  group: { id: number; name: string | null; isPublic: boolean; inviteCode: string | null; memberCount: number };
  dare: DareView;
  voters: Array<PublicProfile & { pass: boolean }>;
};

/** POST /api/proofs/session */
export type ProofSession = { sessionId: string; code: string; issuedAt: string; expiresAt: string };
