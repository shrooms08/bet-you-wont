import { describe, expect, it } from "vitest";
import { baseMime, fitWithin, pickRecorderMime, receiptText } from "./capture";
import { fractionUsed, readout, shortLeft } from "./countdown";
import { storiesFrom } from "./stories";
import type { DareView } from "./types";

describe("receipt text", () => {
  it("BYW · @name · dare #id · local date and time · code", () => {
    const t = receiptText({ username: "juju", dareId: 12, date: new Date("2026-11-06T14:03:00Z"), code: "K7M2PQ", timeZone: "UTC" });
    expect(t).toBe("BYW · @juju · dare #12 · 6 Nov 2026, 14:03 · K7M2PQ");
    expect(receiptText({ username: null, dareId: 1, date: new Date(0), code: "AAAAAA", timeZone: "UTC" })).toMatch(/^BYW · @anon · dare #1 · /);
  });
});

describe("MediaRecorder mime picking", () => {
  it("prefers mp4 (Safari), then webm vp9, vp8, plain webm; null if nothing works", () => {
    expect(pickRecorderMime((t) => t.startsWith("video/mp4"))).toBe("video/mp4;codecs=avc1");
    expect(pickRecorderMime((t) => t === "video/mp4")).toBe("video/mp4");
    expect(pickRecorderMime((t) => t.includes("webm"))).toBe("video/webm;codecs=vp9,opus");
    expect(pickRecorderMime((t) => t === "video/webm;codecs=vp8,opus" || t === "video/webm")).toBe("video/webm;codecs=vp8,opus");
    expect(pickRecorderMime(() => false)).toBeNull();
    expect(baseMime("video/webm;codecs=vp9,opus")).toBe("video/webm");
  });
  it("fits to the long side without upscaling", () => {
    expect(fitWithin(1920, 1080, 1440)).toEqual({ w: 1440, h: 810 });
    expect(fitWithin(720, 1280, 1280)).toEqual({ w: 720, h: 1280 });
    expect(fitWithin(640, 480, 1440)).toEqual({ w: 640, h: 480 });
  });
});

describe("countdown math", () => {
  const start = "2026-11-06T00:00:00Z";
  const end = "2026-11-07T00:00:00Z";
  const at = (iso: string) => Date.parse(iso);
  it("fraction of time used, clamped", () => {
    expect(fractionUsed(start, end, at("2026-11-06T06:00:00Z"))).toBe(0.25);
    expect(fractionUsed(start, end, at("2026-11-05T00:00:00Z"))).toBe(0);
    expect(fractionUsed(start, end, at("2026-11-08T00:00:00Z"))).toBe(1);
    expect(fractionUsed(null, end, 0)).toBe(0);
  });
  it("big readout", () => {
    expect(readout(end, at("2026-11-06T00:47:30Z"))).toBe("23 HR 12 MINS");
    expect(readout(end, at("2026-11-06T22:59:00Z"))).toBe("1 HR 1 MIN");
    expect(readout("2026-11-10T04:00:00Z", at("2026-11-06T00:00:00Z"))).toBe("4 DAYS 4 HR");
    expect(readout(end, at("2026-11-06T23:48:00Z"))).toBe("12 MINS");
    expect(readout(end, at("2026-11-06T23:59:15Z"))).toBe("45 SECS");
    expect(readout(end, at("2026-11-07T00:00:00Z"))).toBe("TIME'S UP");
    expect(shortLeft(end, at("2026-11-06T01:00:00Z"))).toBe("23h");
    expect(shortLeft(end, at("2026-11-06T23:19:00Z"))).toBe("41m");
  });
});

describe("story bubbles", () => {
  const base = { groupId: 1, text: "x", creator: { wallet: "0xc", username: "creator", avatarUrl: null, ringColor: null }, doer: { wallet: "0xd", username: "doer", avatarUrl: null, ringColor: null } } as unknown as DareView;
  const d = (id: number, extra: Partial<DareView> = {}) => ({ ...base, id, ...extra }) as DareView;
  it("one bubble per dare; proof > vote > settle > accept; soonest deadline first within a type", () => {
    const s = storiesFrom({
      toAccept: [d(1), d(5)],
      toVote: [d(2, { voteEnd: "2026-11-06T13:00:00Z" }), d(3, { voteEnd: "2026-11-06T12:30:00Z" })],
      needsProof: [d(4, { proofDeadline: "2026-11-07T00:00:00Z" })],
      toSettle: [d(1)],
    });
    expect(s.map((x) => `${x.label}:${x.dare.id}`)).toEqual(["proof:4", "vote:3", "vote:2", "settle:1", "accept:5"]);
    expect(s.find((x) => x.label === "vote")!.person?.username).toBe("doer"); // vote bubble shows who posted proof
    expect(s.find((x) => x.label === "accept")!.person?.username).toBe("creator");
    expect(storiesFrom(undefined)).toEqual([]);
  });
});
