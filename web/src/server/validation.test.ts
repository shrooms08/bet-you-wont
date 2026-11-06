import { describe, expect, it } from "vitest";
import { magicMatches, parseStoragePath, storagePathFor } from "./media";
import { isUnsafeDare } from "./moderation";
import {
  draftSchema,
  finalizeProofSchema,
  groupNameSchema,
  idSchema,
  inviteCodeSchema,
  permitSchema,
  registerGroupSchema,
  uploadRequestSchema,
  usernameSchema,
} from "./validation";

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => schema.safeParse(v).success;

describe("ids", () => {
  it("accepts positive integers as numbers or strings and returns bigint", () => {
    expect(idSchema.parse(3)).toBe(BigInt(3));
    expect(idSchema.parse("42")).toBe(BigInt(42));
  });
  it("rejects zero, negatives, decimals, leading zeros, junk", () => {
    for (const v of [0, -1, 1.5, "0", "01", "1e3", "abc", "", null, undefined, "99999999999999999999"]) {
      expect(ok(idSchema, v)).toBe(false);
    }
  });
});

describe("usernames", () => {
  it("lowercases and trims", () => {
    expect(usernameSchema.parse("  Minos_99 ")).toBe("minos_99");
  });
  it("enforces 3-20 of [a-z0-9_]", () => {
    expect(ok(usernameSchema, "ab")).toBe(false);
    expect(ok(usernameSchema, "a".repeat(21))).toBe(false);
    expect(ok(usernameSchema, "no spaces")).toBe(false);
    expect(ok(usernameSchema, "dash-ed")).toBe(false);
    expect(ok(usernameSchema, "émile")).toBe(false);
    expect(ok(usernameSchema, "abc")).toBe(true);
    expect(ok(usernameSchema, "a".repeat(20))).toBe(true);
  });
});

describe("group names", () => {
  it("1-40 characters after trimming, counted as code points", () => {
    expect(ok(groupNameSchema, "   ")).toBe(false);
    expect(ok(groupNameSchema, "x")).toBe(true);
    expect(ok(groupNameSchema, "x".repeat(41))).toBe(false);
    expect(ok(groupNameSchema, "🔥".repeat(40))).toBe(true);
    expect(registerGroupSchema.parse({ txHash: `0x${"AB".repeat(32)}`, name: " The Crew " })).toEqual({
      txHash: `0x${"ab".repeat(32)}`,
      name: "The Crew",
    });
  });
  it("tx hash must be 32 bytes hex", () => {
    expect(ok(registerGroupSchema, { txHash: "0x1234", name: "a" })).toBe(false);
  });
});

describe("dare drafts", () => {
  it("trims and enforces 3-140 characters", () => {
    expect(draftSchema.parse({ groupId: "1", text: "  do a backflip  " })).toEqual({ groupId: BigInt(1), text: "do a backflip" });
    expect(ok(draftSchema, { groupId: 1, text: "  hi " })).toBe(false);
    expect(ok(draftSchema, { groupId: 1, text: "x".repeat(140) })).toBe(true);
    expect(ok(draftSchema, { groupId: 1, text: "x".repeat(141) })).toBe(false);
  });
});

describe("moderation blocklist", () => {
  it("blocks clearly dangerous or illegal dares", () => {
    for (const t of [
      "drive drunk to the store",
      "try cocaine",
      "bring a knife to class",
      "shoplift a candy bar",
      "kill yourself lol",
      "set a fire in the park",
      "Steal from the corner shop",
    ]) {
      expect(isUnsafeDare(t), t).toBe(true);
    }
  });
  it("allows ordinary dares, including ones that share words", () => {
    for (const t of [
      "sing at a bus stop",
      "drink a coke in one go",
      "crack an egg on your head",
      "kill it at karaoke",
      "text Molly 'hi'",
      "ask Rob for his number",
      "eat a gunky sandwich",
      "do 20 pushups",
    ]) {
      expect(isUnsafeDare(t), t).toBe(false);
    }
  });
});

describe("upload requests", () => {
  it("allows the bucket's mime types and sizes", () => {
    expect(ok(uploadRequestSchema, { kind: "avatar", mime: "image/png", size: 5 * 1024 * 1024 })).toBe(true);
    expect(ok(uploadRequestSchema, { kind: "proof", mime: "video/webm", size: 50 * 1024 * 1024 })).toBe(true);
    expect(ok(uploadRequestSchema, { kind: "proof", mime: "image/jpeg", size: 10 })).toBe(true);
  });
  it("rejects wrong mime, oversize, zero size, unknown kind", () => {
    expect(ok(uploadRequestSchema, { kind: "avatar", mime: "video/mp4", size: 10 })).toBe(false);
    expect(ok(uploadRequestSchema, { kind: "avatar", mime: "image/heic", size: 10 })).toBe(false);
    expect(ok(uploadRequestSchema, { kind: "avatar", mime: "image/png", size: 5 * 1024 * 1024 + 1 })).toBe(false);
    expect(ok(uploadRequestSchema, { kind: "proof", mime: "image/gif", size: 10 })).toBe(false);
    // proofs are live captures only now: no gallery formats
    for (const mime of ["image/png", "image/webp", "image/heic", "video/quicktime"]) {
      expect(ok(uploadRequestSchema, { kind: "proof", mime, size: 10 }), mime).toBe(false);
    }
    expect(ok(uploadRequestSchema, { kind: "proof", mime: "video/mp4", size: 0 })).toBe(false);
    expect(ok(uploadRequestSchema, { kind: "banner", mime: "image/png", size: 10 })).toBe(false);
  });
});

describe("storage paths", () => {
  const wallet = "0x3B031e43b2710D5D049e465A2d5675C958b659Ce";
  const uuid = "123e4567-e89b-42d3-a456-426614174000";
  it("round-trips kind/<wallet>/<uuid>.<ext> with a lowercased wallet", () => {
    const path = storagePathFor("proof", wallet, uuid, "video/webm");
    expect(path).toBe(`proof/${wallet.toLowerCase()}/${uuid}.webm`);
    expect(parseStoragePath(path)).toEqual({ kind: "proof", wallet: wallet.toLowerCase(), ext: "webm" });
  });
  it("rejects anything we did not issue", () => {
    for (const p of [
      `proof/${wallet.toLowerCase()}/../avatar/x.png`,
      `proof/${wallet}/${uuid}.png`, // mixed-case wallet
      `other/${wallet.toLowerCase()}/${uuid}.png`,
      `proof/${wallet.toLowerCase()}/${uuid}.png/extra`,
      `proof/${wallet.toLowerCase()}/notauuid.png`,
    ]) {
      expect(parseStoragePath(p), p).toBeNull();
    }
  });
});

describe("magic bytes", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]).slice(0, 16);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  it("recognises each allowed type", () => {
    expect(magicMatches("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(magicMatches("image/png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(magicMatches("image/webp", bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")))).toBe(true);
    expect(magicMatches("video/webm", bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe(true);
    expect(magicMatches("video/mp4", bytes(0, 0, 0, 0x20, ...ascii("ftypisom")))).toBe(true);
    expect(magicMatches("video/quicktime", bytes(0, 0, 0, 0x14, ...ascii("ftypqt  ")))).toBe(true);
    expect(magicMatches("image/heic", bytes(0, 0, 0, 0x18, ...ascii("ftypheic")))).toBe(true);
  });
  it("rejects mismatches", () => {
    expect(magicMatches("image/png", bytes(0xff, 0xd8, 0xff))).toBe(false);
    expect(magicMatches("image/heic", bytes(0, 0, 0, 0x20, ...ascii("ftypisom")))).toBe(false);
    expect(magicMatches("application/pdf", bytes(...ascii("%PDF")))).toBe(false);
  });
});

describe("other route bodies", () => {
  it("permit: invite code optional, normalised, and validated", () => {
    expect(permitSchema.parse({ groupId: 2 })).toEqual({ groupId: BigInt(2) });
    expect(permitSchema.parse({ groupId: 2, inviteCode: " ABCDEFGHJK " }).inviteCode).toBe("abcdefghjk");
    expect(ok(permitSchema, { groupId: 2, inviteCode: "abc0efghjk" })).toBe(false); // 0 not in alphabet
    expect(ok(inviteCodeSchema, "abcdefghj")).toBe(false);
  });
  it("finalize: needs dare, path, a capture session id, kind and capture time", () => {
    const good = { dareId: 1, storagePath: "proof/x", sessionId: "8a1d6b0e-0000-4000-8000-000000000001", kind: "video", capturedAt: "2026-11-06T12:00:00.000Z", durationMs: 3000, posterPath: "proof/y" };
    expect(ok(finalizeProofSchema, good)).toBe(true);
    expect(ok(finalizeProofSchema, { dareId: 1, storagePath: "proof/x" })).toBe(false); // no session
    expect(ok(finalizeProofSchema, { ...good, sessionId: "nope" })).toBe(false);
    expect(ok(finalizeProofSchema, { ...good, kind: "gallery" })).toBe(false);
    expect(ok(finalizeProofSchema, { ...good, durationMs: 45_000 })).toBe(false); // over 30 s
  });
});
