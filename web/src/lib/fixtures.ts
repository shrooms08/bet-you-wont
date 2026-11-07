// Fixture data for ?mock=1 (dev only). Shapes match the real API responses.
import type { AdminData, DareDetail, DareView, Feed, FeedItem, FeedPage, HistoryItem, Home, InvitePreview, Leaderboard, Me, MyGroup, PublicGroup, PublicProfile, Stats, UserPage } from "./types";

const WEI = BigInt("1000000000000000000");
const wif = (n: number) => (BigInt(n) * WEI).toString();
const inMin = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const agoMin = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const MOCK_WALLET = "0x7a3f00000000000000000000000000000000c91e";

const p = (username: string, ringColor: string, n: number, streak = 0): PublicProfile => ({
  wallet: `0x${n.toString(16).padStart(40, "0")}`,
  username,
  avatarUrl: null,
  ringColor,
  streak,
});

export const ZEE: PublicProfile = { wallet: MOCK_WALLET, username: "zee", avatarUrl: null, ringColor: "#7B5CE6", streak: 2 };
const ADA = p("ada", "#C3B4F4", 1);
const KEMI = p("kemi", "#B19EF0", 2);
const DAYO = p("dayo", "#B8DA3C", 3, 3);
const TOBI = p("tobi", "#7B5CE6", 4, 4);
const NO_NAME: PublicProfile = { wallet: "0x43d86c35390f2b1ab9a9bde01bae4f2336771078", username: null, avatarUrl: null, ringColor: null };

const FLAGS = { hasVoted: false, canAccept: false, canSubmitProof: false, canVote: false, canSettle: false, canCancel: false, settleOutcome: "None" };

function dare(d: Partial<DareView> & Pick<DareView, "id" | "text" | "creator" | "amount" | "state">): DareView {
  return {
    groupId: 7,
    groupName: "lagos crew",
    target: null,
    doer: null,
    payout: null,
    burned: null,
    outcome: "None",
    doDuration: 86400,
    voteWindow: 3600,
    proofDeadline: null,
    voteEnd: null,
    eligible: null,
    passVotes: 0,
    failVotes: 0,
    proofUrl: null,
    proofMime: null,
    createdAt: agoMin(60),
    createdTx: null,
    settledTx: null,
    ...FLAGS,
    ...d,
  };
}

const D_DARED_YOU = dare({
  id: 41,
  text: "post your worst selfie as your pfp for 24h",
  creator: ADA,
  target: ZEE,
  amount: wif(5000),
  state: "Open",
  createdAt: agoMin(120),
  canAccept: true,
});
const D_VOTE = dare({
  id: 40,
  text: "sing happy birthday to a stranger at the bus stop",
  creator: KEMI,
  target: DAYO,
  doer: DAYO,
  amount: wif(10000),
  state: "Voting",
  voteEnd: inMin(41),
  eligible: 3,
  passVotes: 1,
  proofUrl: "/onboarding/o1-proof.png",
  proofMime: "image/png",
  proofKind: "photo",
  capturedAt: agoMin(26),
  reactionCount: 7,
  createdAt: agoMin(25),
  canVote: true,
});
const D_OPEN_ANYONE = dare({
  id: 39,
  text: "do the macarena in the middle of the market",
  creator: DAYO,
  amount: wif(25000),
  state: "Open",
  createdAt: agoMin(60),
  canAccept: true,
});
const D_ACCEPTED_MINE = dare({
  id: 38,
  text: "order your next drink in a fake accent",
  creator: TOBI,
  target: ZEE,
  doer: ZEE,
  amount: wif(5000),
  state: "Accepted",
  acceptedAt: agoMin(60 * 4 - 48),
  proofDeadline: inMin(60 * 20 + 12),
  createdAt: agoMin(300),
  canSubmitProof: true,
});
const D_ACCEPTED_OTHER = dare({
  id: 44,
  text: "do 50 pushups in the town square",
  creator: KEMI,
  target: DAYO,
  doer: DAYO,
  amount: wif(8000),
  state: "Accepted",
  acceptedAt: agoMin(60 * 10),
  proofDeadline: inMin(60 * 14),
  createdAt: agoMin(60 * 11),
});
const D_SETTLE = dare({
  id: 37,
  text: "wear socks with sandals to brunch",
  creator: NO_NAME,
  target: KEMI,
  doer: KEMI,
  amount: wif(2000),
  state: "Voting",
  voteEnd: agoMin(5),
  eligible: 3,
  passVotes: 2,
  proofUrl: "/onboarding/o1-paid.png",
  proofMime: "image/png",
  canSettle: true,
  settleOutcome: "Passed",
  createdAt: agoMin(60 * 26),
});
const D_PASSED = dare({
  id: 36,
  text: "order in a fake accent at the suya spot",
  creator: ADA,
  target: TOBI,
  doer: TOBI,
  amount: wif(10000),
  payout: wif(9500),
  burned: wif(500),
  state: "Settled",
  outcome: "Passed",
  proofUrl: "/onboarding/o1-dared.png",
  proofMime: "image/png",
  proofKind: "photo",
  reactionCount: 23,
  reacted: true,
  createdAt: agoMin(60 * 30),
});
const D_FAILED = dare({
  id: 35,
  text: "go 24h without checking your phone",
  creator: ZEE,
  target: KEMI,
  doer: KEMI,
  amount: wif(5000),
  payout: wif(4500),
  burned: wif(500),
  state: "Settled",
  outcome: "Failed",
  createdAt: agoMin(60 * 50),
});
const D_EXPIRED = dare({
  id: 34,
  text: "compliment 5 strangers' outfits in one day",
  creator: ADA,
  target: DAYO,
  doer: DAYO,
  amount: wif(10000),
  payout: wif(10000),
  burned: "0",
  state: "Settled",
  outcome: "Expired",
  createdAt: agoMin(60 * 96),
});
const D_NOVOTES = dare({
  id: 32,
  text: "do a cartwheel in the office lobby",
  creator: ADA,
  target: null,
  doer: DAYO,
  amount: wif(2500),
  payout: wif(2500),
  burned: "0",
  state: "Settled",
  outcome: "NoVotes",
  createdAt: agoMin(60 * 100),
});
const D_CANCELLED = dare({
  id: 33,
  text: "eat a raw onion like an apple",
  creator: ZEE,
  amount: wif(1000),
  state: "Cancelled",
  createdAt: agoMin(60 * 120),
});
const D_MINE_OPEN = dare({
  id: 42,
  text: "learn and perform a tiktok dance at the office",
  creator: ZEE,
  amount: wif(3000),
  state: "Open",
  createdAt: agoMin(10),
  canCancel: true,
});

const LAGOS_MEMBERS = [TOBI, ADA, KEMI, DAYO, ZEE];

const GROUPS: MyGroup[] = [
  { id: 7, name: "lagos crew", isPublic: false, isCreator: true, inviteCode: "k7m2p9xq4h", memberCount: 5, liveDareCount: 3, members: LAGOS_MEMBERS },
  { id: 1, name: null, isPublic: true, isCreator: false, inviteCode: null, memberCount: 318, liveDareCount: 16, members: [ADA, TOBI, DAYO, KEMI] },
];

export const MOCK_STATS: Stats = {
  score: 1240,
  scoreWeek: 0,
  currentStreak: 2,
  bestStreak: 5,
  weekQualified: false,
  daresDone: 9,
  daresDared: 14,
  wifWon: wif(61500),
  wifBurned: wif(5250),
  freezeOffer: null,
};

export function mockMe(mode: "full" | "empty" | "external", ageConfirmed = true): Me {
  return {
    wallet: MOCK_WALLET,
    wallets: [MOCK_WALLET],
    profile: { ...ZEE, ageConfirmed },
    isAdmin: true,
    groups: mode === "empty" ? [] : GROUPS,
    stats: mode === "empty" ? { ...MOCK_STATS, score: 0, currentStreak: 0, bestStreak: 0, daresDone: 0, daresDared: 0, wifWon: "0", wifBurned: "0" } : MOCK_STATS,
  };
}

export function mockHome(mode: "full" | "empty" | "external"): Home {
  if (mode === "empty") return { wallet: MOCK_WALLET, waitingOnYou: { toAccept: [], toVote: [], needsProof: [], toSettle: [] }, groups: [] };
  return {
    wallet: MOCK_WALLET,
    waitingOnYou: { toAccept: [D_DARED_YOU, D_OPEN_ANYONE], toVote: [D_VOTE], needsProof: [D_ACCEPTED_MINE], toSettle: [D_SETTLE] },
    groups: GROUPS,
  };
}

export function mockFeed(id: number, mode: "full" | "empty" | "external"): Feed {
  const g = GROUPS.find((x) => x.id === id) ?? GROUPS[0];
  const dares =
    mode === "empty"
      ? []
      : [D_MINE_OPEN, D_DARED_YOU, D_VOTE, D_OPEN_ANYONE, D_ACCEPTED_MINE, D_SETTLE, D_PASSED, D_FAILED, D_EXPIRED, D_NOVOTES, D_CANCELLED].map((d) => ({
          ...d,
          groupId: g.id,
        }));
  return {
    viewer: MOCK_WALLET,
    group: { id: g.id, name: g.name, isPublic: g.isPublic, creator: g.isCreator ? ZEE : ADA, inviteCode: g.inviteCode ?? "k7m2p9xq4h" },
    members: (g.members ?? LAGOS_MEMBERS).map((m) => ({ ...m, joinedAt: agoMin(60 * 24 * 10) })),
    stats: { memberCount: g.memberCount, openDares: 3, liveDares: 5, paidOut: wif(9500), refunded: wif(14500), burned: wif(1000) },
    dares,
  };
}

export const MOCK_INVITE: InvitePreview = { groupId: 7, name: "lagos crew", isPublic: false, memberCount: 5, creator: ADA };

export const MOCK_PUBLIC_GROUP: PublicGroup = {
  groupId: 1,
  name: null,
  memberCount: 318,
  openDares: 12,
  votingDares: 4,
  members: [ADA, TOBI, DAYO, KEMI],
};

export const MOCK_BALANCES = { eth: BigInt("4100000000000000"), wif: BigInt(42000) * WEI };

const D_PASSED_MINE = dare({
  id: 45,
  text: "sing the national anthem on a crowded train",
  creator: KEMI,
  target: ZEE,
  doer: ZEE,
  amount: wif(10000),
  payout: wif(9500),
  burned: wif(500),
  state: "Settled",
  outcome: "Passed",
  proofUrl: "/onboarding/o1-paid.png",
  proofMime: "image/png",
  proofKind: "photo",
  reactionCount: 12,
  createdAt: agoMin(60 * 5),
});

const ALL_DARES = [D_PASSED_MINE, D_MINE_OPEN, D_DARED_YOU, D_VOTE, D_OPEN_ANYONE, D_ACCEPTED_MINE, D_ACCEPTED_OTHER, D_SETTLE, D_PASSED, D_FAILED, D_EXPIRED, D_NOVOTES, D_CANCELLED];

/** Dare detail fixtures. Ids: 42/41/39 open, 38 accepted (yours), 44 accepted (someone else),
 *  40 voting, 37 ready to settle, 36 passed, 35 failed, 34 expired, 33 cancelled, 32 no votes. */
export function mockDare(id: number): DareDetail {
  const d = ALL_DARES.find((x) => x.id === id) ?? D_VOTE;
  return {
    viewer: MOCK_WALLET,
    myPoints: d.id === 45 ? 125 : 0,
    member: true,
    group: { id: 7, name: "lagos crew", isPublic: false, inviteCode: "k7m2p9xq4h", memberCount: 5 },
    dare: d,
    voters:
      d.state === "Voting" || d.outcome === "Passed" || d.outcome === "Failed"
        ? [
            { ...ADA, pass: true },
            ...(d.passVotes > 1 ? [{ ...TOBI, pass: true }] : []),
            ...(d.outcome === "Failed" ? [{ ...DAYO, pass: false }] : []),
          ]
        : [],
  };
}

export function mockFeedPage(mode: "full" | "empty" | "external"): FeedPage {
  if (mode === "empty") return { items: [], nextCursor: null };
  const media = (d: DareView): FeedItem => ({ ...d, post: "media", member: true });
  const challenge = (d: DareView): FeedItem => ({ ...d, post: "challenge", member: true });
  return {
    items: [media(D_VOTE), challenge(D_MINE_OPEN), media(D_SETTLE), challenge(D_DARED_YOU), media(D_PASSED), challenge({ ...D_OPEN_ANYONE, groupId: 1, groupName: null })],
    nextCursor: null,
  };
}

const tile = (d: DareView) => ({ dareId: d.id, state: d.state, outcome: d.outcome, kind: "photo" as const, thumb: d.proofUrl });

export function mockUser(username: string): UserPage {
  const isMe = username === "zee";
  const person = isMe ? ZEE : ([ADA, KEMI, DAYO, TOBI].find((x) => x.username === username) ?? DAYO);
  return {
    me: isMe,
    profile: person,
    stats: isMe ? MOCK_STATS : { ...MOCK_STATS, score: 860, currentStreak: person.streak ?? 0, bestStreak: 4, daresDone: 6, daresDared: 3 },
    did: isMe ? [tile(D_PASSED_MINE), tile(D_VOTE), tile(D_PASSED), tile(D_SETTLE)] : [tile(D_VOTE), tile(D_PASSED)],
    dared: isMe ? [tile(D_PASSED), tile(D_SETTLE)] : [tile(D_PASSED_MINE)],
  };
}

export function mockLeaderboard(period: "week" | "all"): Leaderboard {
  const pts = period === "week" ? [150, 110, 45, 5, 0] : [1240, 860, 410, 120, 40];
  return { period, rows: [ZEE, DAYO, TOBI, ADA, KEMI].map((person, i) => ({ rank: i + 1, points: pts[i], person })) };
}

export const MOCK_HISTORY: HistoryItem[] = [
  { type: "dare", dareId: 45, text: D_PASSED_MINE.text, role: "doer", outcome: "Passed", kind: "won", amount: wif(9500), burned: "0", tx: `0x${"ab".repeat(32)}`, at: agoMin(60 * 5) },
  { type: "freeze", week: "2026-W44", amount: wif(2000), tx: `0x${"cd".repeat(32)}`, at: agoMin(60 * 30) },
  { type: "dare", dareId: 35, text: D_FAILED.text, role: "creator", outcome: "Failed", kind: "refunded", amount: wif(4500), burned: wif(500), tx: `0x${"ef".repeat(32)}`, at: agoMin(60 * 50) },
  { type: "dare", dareId: 33, text: "eat a raw onion like an apple", role: "creator", outcome: "Passed", kind: "lost", amount: wif(1000), burned: wif(50), tx: null, at: agoMin(60 * 120) },
];

/** /admin in mock mode: one reported public dare (media auto-hidden), one blocked profile. */
export const MOCK_ADMIN: AdminData = {
  items: [
    {
      dareId: 45,
      groupId: 1,
      groupName: null,
      isPublic: true,
      text: "sing the national anthem on a crowded train",
      state: "Settled",
      outcome: "Passed",
      creator: ADA,
      doer: DAYO,
      proofUrl: "/onboarding/o1-paid.png",
      posterUrl: null,
      proofKind: "photo",
      hasProof: true,
      textHidden: null,
      mediaHidden: { at: agoMin(30), by: "auto" },
      latestReport: agoMin(30),
      reports: [
        { id: "r1", target: "proof", reason: "no_consent", details: "the people behind didn't agree to this", reporter: TOBI, at: agoMin(30) },
        { id: "r2", target: "proof", reason: "harassment", details: null, reporter: ADA, at: agoMin(90) },
      ],
    },
  ],
  blocked: [{ wallet: "0x00000000000000000000000000000000000000b1", username: "spammer_01", blockedAt: agoMin(600) }],
};
