import { describe, expect, it } from "vitest";
import { formatUsd, formatWif, groupName, handle, inviteCodeFrom, PUBLIC_GROUP_NAME, shortAddress, splitKeyPhrase, timeAgo, timeLeft } from "./format";
import { plainError } from "./plainErrors";

const WEI = BigInt("1000000000000000000");

describe("splitKeyPhrase", () => {
  it("highlights up to the first preposition (max 5 words)", () => {
    expect(splitKeyPhrase("sing happy birthday to a stranger at the bus stop")).toEqual({ key: "sing happy birthday", rest: " to a stranger at the bus stop" });
    expect(splitKeyPhrase("order your next drink in a fake accent")).toEqual({ key: "order your next drink", rest: " in a fake accent" });
    expect(splitKeyPhrase("post your worst selfie as your pfp for 24h")).toEqual({ key: "post your worst selfie", rest: " as your pfp for 24h" });
    expect(splitKeyPhrase("compliment a stranger's outfit")).toEqual({ key: "compliment a stranger's outfit", rest: "" });
  });
  it("strips a leading 'bet you won't' / 'i dare you to', lowercases, caps at 5 words", () => {
    expect(splitKeyPhrase("Bet you won't Eat A Lemon")).toEqual({ key: "eat a lemon", rest: "" });
    expect(splitKeyPhrase("i dare you to do it")).toEqual({ key: "do it", rest: "" });
    expect(splitKeyPhrase("one two three four five six seven").key).toBe("one two three four five");
    expect(splitKeyPhrase("  ")).toEqual({ key: "", rest: "" });
    expect(splitKeyPhrase(null)).toEqual({ key: "", rest: "" });
  });
});

describe("money", () => {
  it("formats whole tokens with separators and keeps small decimals", () => {
    expect(formatWif((BigInt(5000) * WEI).toString())).toBe("5,000");
    expect(formatWif(BigInt(1_500_000) * WEI)).toBe("1,500,000");
    expect(formatWif(WEI / BigInt(2))).toBe("0.5");
  });
  it("USD: rounded >= $10, cents below, < $0.01 floor, null without a price", () => {
    expect(formatUsd(BigInt(5000) * WEI, 0.0014)).toBe("≈ $7");
    expect(formatUsd(BigInt(10000) * WEI, 0.00127)).toBe("≈ $13");
    expect(formatUsd(BigInt(100) * WEI, 0.0014)).toBe("≈ $0.14");
    expect(formatUsd(WEI, 0.0014)).toBe("< $0.01");
    expect(formatUsd(WEI, null)).toBeNull();
  });
});

describe("time", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const at = (min: number) => new Date(now + min * 60_000).toISOString();
  it("timeLeft", () => {
    expect(timeLeft(at(41), now)).toBe("41m");
    expect(timeLeft(at(0.5), now)).toBe("<1m");
    expect(timeLeft(at(300), now)).toBe("5h");
    expect(timeLeft(at(60 * 72), now)).toBe("3d");
    expect(timeLeft(at(-1), now)).toBeNull();
    expect(timeLeft(null, now)).toBeNull();
  });
  it("timeAgo", () => {
    expect(timeAgo(at(-25), now)).toBe("25m ago");
    expect(timeAgo(at(-120), now)).toBe("2h ago");
    expect(timeAgo(at(-60 * 30), now)).toBe("yesterday");
    expect(timeAgo(at(-60 * 96), now)).toBe("4d ago");
  });
});

describe("people and groups", () => {
  it("handle: @name, else a short address, else anyone", () => {
    expect(handle({ wallet: "0x3b031e43b2710d5d049e465a2d5675c958b659ce", username: "kemi" })).toBe("@kemi");
    expect(handle({ wallet: "0x3b031e43b2710d5d049e465a2d5675c958b659ce", username: null })).toBe("0x3b03…59ce");
    expect(handle(null)).toBe("anyone");
    expect(shortAddress("0x12")).toBe("0x12");
  });
  it("the public group gets its name when none is stored", () => {
    expect(groupName(1, null)).toBe(PUBLIC_GROUP_NAME);
    expect(groupName(1, "custom")).toBe("custom");
    expect(groupName(9, null)).toBe("crew #9");
  });
  it("invite codes from links or raw codes", () => {
    expect(inviteCodeFrom("https://betyouwont.app/i/k7m2p9xq4h")).toBe("k7m2p9xq4h");
    expect(inviteCodeFrom("  K7M2P9XQ4H ")).toBe("k7m2p9xq4h");
    expect(inviteCodeFrom("k7m2p9xq4")).toBeNull();
    expect(inviteCodeFrom("k7m2p9xq40")).toBeNull(); // 0 is not in the alphabet
  });
});

describe("plainError", () => {
  it("maps escrow custom errors to plain words", () => {
    expect(plainError("Reverted: GroupTooSmall")).toBe("a crew needs at least 3 people before anyone can dare.");
    expect(plainError("Reverted: CreatorCannotVote")).toMatch(/your friends decide/);
  });
  it("wallet, gas, rate limit, network and API messages", () => {
    expect(plainError("You rejected the request in your wallet.")).toBe("you cancelled it in your wallet.");
    expect(plainError("insufficient funds for gas * price + value")).toMatch(/little ETH for gas/);
    expect(plainError("/api/permit → 429: Too many permits: max 10 per hour.")).toBe("slow down a sec, then try again.");
    expect(plainError("Failed to fetch")).toBe("couldn't reach the network. try again.");
    expect(plainError("/api/permit → 403: This group is private: you need its invite link to join.")).toBe(
      "this group is private: you need its invite link to join.",
    );
  });
});
