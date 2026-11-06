import { describe, expect, it } from "vitest";
import { zeroAddress, zeroHash, type Hex } from "viem";
import { dareActions, resolveDare, type DareLike } from "./dareRules";
import {
  chunkRanges,
  collectTouched,
  dareRow,
  groupByShape,
  groupRow,
  memberRow,
  voteRow,
  type EscrowLog,
  type OnchainDare,
} from "./syncMap";

const A = "0x3B031e43b2710D5D049e465A2d5675C958b659Ce";
const B = "0x43D86C35390f2B1ab9a9bDE01bAE4f2336771078";
const CREATOR = "0x0DAC29759b70D9a0d60A95bf4A8BC1c4Ec9d1779";
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const n = (v: number) => BigInt(v);

const log = (eventName: string, args: Record<string, unknown>, block: number, idx = 0, t = block): EscrowLog => ({
  eventName,
  args,
  blockNumber: n(block),
  transactionHash: tx(t),
  logIndex: idx,
});

describe("collectTouched", () => {
  const logs = [
    // deliberately out of order: the mapper sorts by (block, logIndex)
    log("Voted", { dareId: n(1), voter: B, pass: true }, 130),
    log("GroupCreated", { groupId: n(1), creator: CREATOR, isPublic: true }, 100, 0),
    log("MemberJoined", { groupId: n(1), member: CREATOR }, 100, 1),
    log("MemberJoined", { groupId: n(1), member: A }, 101),
    log("DareCreated", { dareId: n(1), groupId: n(1), creator: CREATOR }, 110),
    log("DareAccepted", { dareId: n(1), doer: A }, 111),
    log("ProofSubmitted", { dareId: n(1) }, 120),
    log("DareSettled", { dareId: n(1), outcome: 1, recipient: A, payout: n(95), burned: n(5) }, 140),
    log("DareCancelled", { dareId: n(2) }, 150),
    log("Paused", { account: CREATOR }, 160),
  ];
  const t = collectTouched(logs);

  it("collects every touched group and dare once", () => {
    expect([...t.groups.keys()]).toEqual([n(1)]);
    expect([...t.dares.keys()].sort()).toEqual([n(1), n(2)]);
  });
  it("records creation/settlement txs and amounts", () => {
    expect(t.groups.get(n(1))).toEqual({ createdTx: tx(100) });
    expect(t.dares.get(n(1))).toEqual({ createdTx: tx(110), createdBlock: n(110), settledTx: tx(140), payout: n(95), burned: n(5) });
    expect(t.dares.get(n(2))).toEqual({});
  });
  it("keeps member joins and votes in chain order, lowercased", () => {
    expect(t.members.map((m) => m.wallet)).toEqual([CREATOR.toLowerCase(), A.toLowerCase()]);
    expect(t.votes).toEqual([{ dareId: n(1), voter: B.toLowerCase(), pass: true, tx: tx(130), block: n(130) }]);
  });
  it("asks for timestamps of join, create and vote blocks only", () => {
    expect([...t.blocks].sort()).toEqual([n(100), n(101), n(110), n(130)]);
  });
});

describe("row mapping", () => {
  const times = new Map([[n(110), n(1_793_950_000)], [n(130), n(1_793_950_600)], [n(101), n(1_793_949_000)]]);
  const onchain: OnchainDare = {
    creator: CREATOR,
    doDuration: 3600,
    voteWindow: 900,
    state: 4,
    outcome: 1,
    target: zeroAddress,
    acceptedAt: n(1_793_950_100),
    doer: A,
    proofDeadline: n(1_793_953_700),
    amount: n(10_000) * n(10) ** n(18),
    proofAt: n(1_793_950_200),
    voteEnd: n(1_793_951_100),
    groupId: n(1),
    membersAtProof: 4,
    eligible: 2,
    passVotes: 1,
    failVotes: 0,
    metaHash: `0x${"ab".repeat(32)}`,
    proofHash: `0x${"cd".repeat(32)}`,
  };

  it("maps an onchain dare + events to a full row", () => {
    const row = dareRow(n(1), onchain, { createdTx: tx(110), createdBlock: n(110), settledTx: tx(140), payout: n(95), burned: n(5) }, times, "sing", new Date("2026-11-06T12:00:00Z"));
    expect(row).toEqual({
      id: "1",
      group_id: "1",
      creator_wallet: CREATOR.toLowerCase(),
      target_wallet: null,
      doer_wallet: A.toLowerCase(),
      amount: "10000000000000000000000", // exact, no float rounding
      do_duration: 3600,
      vote_window: 900,
      meta_hash: onchain.metaHash,
      state: "Settled",
      outcome: "Passed",
      accepted_at: new Date(1_793_950_100_000).toISOString(),
      proof_deadline: new Date(1_793_953_700_000).toISOString(),
      vote_end: new Date(1_793_951_100_000).toISOString(),
      proof_hash: onchain.proofHash,
      eligible: 2,
      pass_votes: 1,
      fail_votes: 0,
      updated_at: "2026-11-06T12:00:00.000Z",
      created_tx: tx(110),
      created_at: new Date(1_793_950_000_000).toISOString(),
      settled_tx: tx(140),
      payout: "95",
      burned: "5",
      text: "sing",
    });
  });

  it("omits fields this sync window does not know, so upserts never blank them", () => {
    const open = { ...onchain, state: 1, outcome: 0, doer: zeroAddress, acceptedAt: n(0), proofDeadline: n(0), voteEnd: n(0), proofHash: zeroHash };
    const row = dareRow(n(5), open, {}, times, undefined, new Date());
    for (const key of ["created_tx", "created_at", "settled_tx", "payout", "burned", "text"]) expect(row).not.toHaveProperty(key);
    expect(row).toMatchObject({ state: "Open", outcome: "None", doer_wallet: null, accepted_at: null, proof_deadline: null, vote_end: null, proof_hash: null });
  });

  it("maps groups, members and votes", () => {
    expect(groupRow(n(2), { creator: B, isPublic: false, memberCount: 3, createdAt: n(1_793_940_000) }, {})).toEqual({
      id: "2",
      is_public: false,
      creator_wallet: B.toLowerCase(),
      created_at: new Date(1_793_940_000_000).toISOString(),
    });
    expect(memberRow({ groupId: n(1), wallet: A.toLowerCase(), tx: tx(101), block: n(101) }, times)).toEqual({
      group_id: "1",
      wallet_address: A.toLowerCase(),
      joined_at: new Date(1_793_949_000_000).toISOString(),
      join_tx: tx(101),
    });
    expect(voteRow({ dareId: n(1), voter: B.toLowerCase(), pass: false, tx: tx(130), block: n(130) }, times)).toMatchObject({
      dare_id: "1",
      pass: false,
      created_at: new Date(1_793_950_600_000).toISOString(),
    });
  });
});

describe("chunkRanges", () => {
  it("covers the range exactly in 5,000-block chunks", () => {
    expect(chunkRanges(n(1), n(12_000), n(5000))).toEqual([
      [n(1), n(5000)],
      [n(5001), n(10_000)],
      [n(10_001), n(12_000)],
    ]);
    expect(chunkRanges(n(10), n(10), n(5000))).toEqual([[n(10), n(10)]]);
    expect(chunkRanges(n(11), n(10), n(5000))).toEqual([]);
  });
});

describe("groupByShape", () => {
  it("never mixes rows with different keys in one bulk upsert", () => {
    const batches = groupByShape([{ id: 1, a: 1 }, { id: 2 }, { a: 3, id: 3 }]);
    expect(batches).toEqual([[{ id: 1, a: 1 }, { a: 3, id: 3 }], [{ id: 2 }]]);
  });
});

describe("dare rules (mirror of BYWEscrow._resolve)", () => {
  const t0 = Date.parse("2026-11-06T12:00:00Z");
  const iso = (ms: number) => new Date(ms).toISOString();
  const voting = (p: Partial<DareLike> = {}): DareLike => ({
    state: "Voting",
    creator_wallet: CREATOR.toLowerCase(),
    target_wallet: null,
    doer_wallet: A.toLowerCase(),
    proof_deadline: iso(t0 + 3_600_000),
    vote_end: iso(t0 + 900_000),
    vote_window: 900,
    eligible: 3,
    pass_votes: 0,
    fail_votes: 0,
    ...p,
  });

  it("locks pass at passVotes*2 >= eligible and fail at failVotes*2 > eligible", () => {
    expect(resolveDare(voting({ pass_votes: 2 }), t0)).toEqual({ canSettle: true, outcome: "Passed" });
    expect(resolveDare(voting({ pass_votes: 1 }), t0)).toEqual({ canSettle: false, outcome: "None" });
    expect(resolveDare(voting({ fail_votes: 2 }), t0)).toEqual({ canSettle: true, outcome: "Failed" });
    expect(resolveDare(voting({ eligible: 4, fail_votes: 2 }), t0)).toEqual({ canSettle: false, outcome: "None" });
  });
  it("after voteEnd: ties and zero votes pass", () => {
    const after = t0 + 900_001;
    expect(resolveDare(voting(), after).outcome).toBe("Passed");
    expect(resolveDare(voting({ eligible: 5, pass_votes: 1, fail_votes: 1 }), after).outcome).toBe("Passed");
    expect(resolveDare(voting({ eligible: 5, pass_votes: 0, fail_votes: 1 }), after).outcome).toBe("Failed");
  });
  it("Accepted past the proof deadline is Expired", () => {
    const accepted = voting({ state: "Accepted", vote_end: null });
    expect(resolveDare(accepted, t0 + 3_600_000).canSettle).toBe(false);
    expect(resolveDare(accepted, t0 + 3_600_001)).toEqual({ canSettle: true, outcome: "Expired" });
  });
  it("buttons: accept, proof, vote, cancel", () => {
    const open = voting({ state: "Open", doer_wallet: null, vote_end: null, proof_deadline: null });
    const viewer = (w: string, joinedAt = iso(t0 - 1_000_000), hasVoted = false) => ({ wallet: w.toLowerCase(), joinedAt, hasVoted });
    expect(dareActions(open, viewer(B), t0).canAccept).toBe(true);
    expect(dareActions(open, viewer(CREATOR), t0)).toMatchObject({ canAccept: false, canCancel: true });
    expect(dareActions({ ...open, target_wallet: A.toLowerCase() }, viewer(B), t0).canAccept).toBe(false);

    const accepted = voting({ state: "Accepted", vote_end: null });
    expect(dareActions(accepted, viewer(A), t0).canSubmitProof).toBe(true);
    expect(dareActions(accepted, viewer(B), t0).canSubmitProof).toBe(false);

    const v = voting();
    expect(dareActions(v, viewer(B), t0).canVote).toBe(true);
    expect(dareActions(v, viewer(B, undefined, true), t0).canVote).toBe(false); // already voted
    expect(dareActions(v, viewer(A), t0).canVote).toBe(false); // doer
    expect(dareActions(v, viewer(CREATOR), t0).canVote).toBe(false); // creator
    expect(dareActions(v, viewer(B, iso(t0)), t0).canVote).toBe(true); // joined in the proof's second: allowed (joinedAt <= proofAt)
    expect(dareActions(v, viewer(B, iso(t0 + 1000)), t0).canVote).toBe(false); // joined after proof (proofAt = t0)
    expect(dareActions(v, viewer(B), t0 + 900_001).canVote).toBe(false); // voting closed
  });
});
