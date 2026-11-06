import { describe, expect, it } from "vitest";
import type { DareView } from "@/lib/types";
import { scallopPath } from "../ui/States";
import { tagFor } from "../ui/StatusTag";
import { dareNote } from "./DareCard";
import { waitingItems } from "./WaitingCard";

const WEI = BigInt("1000000000000000000");
const base: DareView = {
  id: 1, groupId: 1, text: "x y z", creator: { wallet: "0xa", username: "ada", avatarUrl: null, ringColor: null }, target: null, doer: null,
  amount: (BigInt(1000) * WEI).toString(), payout: null, burned: null, state: "Open", outcome: "None", doDuration: 86400, voteWindow: 3600,
  proofDeadline: null, voteEnd: null, eligible: null, passVotes: 0, failVotes: 0, proofUrl: null, proofMime: null, createdTx: null, settledTx: null,
  hasVoted: false, canAccept: false, canSubmitProof: false, canVote: false, canSettle: false, canCancel: false, settleOutcome: "None",
};

describe("tagFor", () => {
  it("maps every state/outcome to a tag word", () => {
    expect(tagFor("Open", "None")).toBe("OPEN");
    expect(tagFor("Accepted", "None")).toBe("AIGHT BET");
    expect(tagFor("Voting", "None")).toBe("VOTING");
    expect(tagFor("Settled", "Passed")).toBe("PASSED");
    expect(tagFor("Settled", "Failed")).toBe("FAILED");
    expect(tagFor("Settled", "Expired")).toBe("EXPIRED");
    expect(tagFor("Cancelled", "None")).toBe("CANCELLED");
  });
});

describe("waitingItems", () => {
  it("one entry per dare, most urgent action first (proof > vote > settle > accept)", () => {
    const a = { ...base, id: 1 };
    const b = { ...base, id: 2 };
    const c = { ...base, id: 3 };
    const items = waitingItems({ toAccept: [a, b], toVote: [b], needsProof: [c], toSettle: [a] });
    expect(items.map((i) => `${i.kind}:${i.dare.id}`)).toEqual(["proof:3", "vote:2", "settle:1"]);
    expect(waitingItems(undefined)).toEqual([]);
  });
});

describe("dareNote", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  it("explains each status in one line", () => {
    expect(dareNote(base, now)).toBe("1d to do it once someone says aight bet");
    expect(dareNote({ ...base, state: "Voting", voteEnd: new Date(now + 41 * 60_000).toISOString() }, now)).toBe("proof is in. voting closes in 41m");
    expect(
      dareNote({ ...base, state: "Settled", outcome: "Passed", doer: { wallet: "0xb", username: "tobi", avatarUrl: null, ringColor: null }, payout: (BigInt(950) * WEI).toString(), burned: (BigInt(50) * WEI).toString() }, now),
    ).toBe("it counts. @tobi got 950 · 50 burned");
  });
});

describe("scallopPath", () => {
  it("is a closed path with one curve per bump", () => {
    const d = scallopPath(110, 110, 98, 86, 21);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/Q/g)).toHaveLength(21);
  });
});
