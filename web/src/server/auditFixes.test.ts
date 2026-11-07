import { describe, expect, it } from "vitest";
import { isAdmin, adminWallets } from "./admin";
import { cardVersion } from "./linkPreview";
import { hiddenFor, hideThreshold, shouldAutoHide } from "./moderationRules";
import { checkPublicPermit, PUBLIC_MIN_ACCOUNT_AGE_MS } from "./permitRules";
import { matchProofs, proofBelongsTo, type ProofRow } from "./proofMatch";
import { checkSession, type SessionRow } from "./proofSession";
import { CONFIRMATIONS, collectTouched, safeHead, splitRange, wellFormed, type EscrowLog } from "./syncMap";
import { AVATAR_UPLOADS_PER_DAY, checkUploadBudget, DAY_MS, PROOF_BYTES_PER_DAY, staleObjects } from "./uploadRules";
import { uploadRequestSchema } from "./validation";

const VICTIM = "0x00000000000000000000000000000000000000a1";
const ATTACKER = "0x00000000000000000000000000000000000000b2";
const H = `0x${"ab".repeat(32)}`;
const proofRow = (p: Partial<ProofRow> = {}): ProofRow => ({
  proof_hash: H,
  dare_id: 7,
  uploader_wallet: VICTIM,
  storage_path: `proof/${VICTIM}/11111111-1111-4111-8111-111111111111.jpg`,
  mime: "image/jpeg",
  kind: "photo",
  poster_path: null,
  captured_at: null,
  duration_ms: null,
  deleted_at: null,
  ...p,
});

describe("H-2: proofs only show on the dare they were finalized for", () => {
  const victimDare = { id: 7, proof_hash: H, doer_wallet: VICTIM };
  it("matches the real dare", () => {
    expect(proofBelongsTo(proofRow(), victimDare)).toBe(true);
    expect(matchProofs([victimDare], [proofRow()]).get(7)?.storage_path).toContain(VICTIM);
  });
  it("cross-dare hash attack: copying a private proof's hash onto your own dare shows NO media", () => {
    // attacker's public dare 99 submitted the victim's hash onchain
    const attackerDare = { id: 99, proof_hash: H, doer_wallet: ATTACKER };
    expect(proofBelongsTo(proofRow(), attackerDare)).toBe(false);
    const m = matchProofs([victimDare, attackerDare], [proofRow()]);
    expect(m.has(7)).toBe(true);
    expect(m.has(99)).toBe(false);
  });
  it("same dare id but a different doer, a different hash, a deleted file or no file: no media", () => {
    expect(proofBelongsTo(proofRow(), { ...victimDare, doer_wallet: ATTACKER })).toBe(false);
    expect(proofBelongsTo(proofRow(), { ...victimDare, proof_hash: `0x${"cd".repeat(32)}` })).toBe(false);
    expect(proofBelongsTo(proofRow({ deleted_at: "2026-11-07T00:00:00Z" }), victimDare)).toBe(false);
    expect(proofBelongsTo(proofRow({ storage_path: null }), victimDare)).toBe(false);
    expect(proofBelongsTo(proofRow(), { ...victimDare, proof_hash: null })).toBe(false);
  });
  it("is case-insensitive on hashes and wallets, and picks the matching row among several", () => {
    expect(proofBelongsTo(proofRow({ proof_hash: H.toUpperCase().replace("0X", "0x"), uploader_wallet: VICTIM.toUpperCase().replace("0X", "0x") }), victimDare)).toBe(true);
    const old = proofRow({ proof_hash: `0x${"ee".repeat(32)}`, storage_path: "proof/old.jpg" });
    expect(matchProofs([victimDare], [old, proofRow()]).get(7)?.proof_hash).toBe(H);
  });
});

describe("L-3: capture sessions are single-use", () => {
  const s: SessionRow = {
    id: "s1",
    dare_id: 7,
    wallet_address: VICTIM,
    privy_user_id: "did:privy:u1",
    code: "K7M2PQ",
    issued_at: "2026-11-07T10:00:00Z",
    expires_at: "2026-11-07T10:15:00Z",
    used_at: null,
  };
  const ctx = { dareId: 7, wallet: VICTIM, userId: "did:privy:u1", now: Date.parse("2026-11-07T10:05:00Z") };
  it("ok once, then 'used'", () => {
    expect(checkSession(s, ctx)).toBe("ok");
    expect(checkSession({ ...s, used_at: "2026-11-07T10:06:00Z" }, ctx)).toBe("used");
  });
  it("still checks dare, user and expiry first", () => {
    expect(checkSession(s, { ...ctx, dareId: 8 })).toBe("wrong-dare");
    expect(checkSession(s, { ...ctx, userId: "did:privy:other" })).toBe("wrong-user");
    expect(checkSession(s, { ...ctx, now: Date.parse("2026-11-07T10:20:00Z") })).toBe("expired");
  });
});

describe("M-4: upload budgets, session-bound proof uploads, cleanup", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const MB = 1024 * 1024;
  it("300 MB of proof per rolling day (retakes count)", () => {
    const used = [{ kind: "proof" as const, declared_bytes: 250 * MB, created_at: ago(3_600_000) }];
    expect(checkUploadBudget("proof", 50 * MB, used, now)).toBe("ok");
    expect(checkUploadBudget("proof", 50 * MB + 1, used, now)).toBe("proof-budget");
    expect(PROOF_BYTES_PER_DAY).toBe(300 * MB);
    // yesterday's uploads don't count
    expect(checkUploadBudget("proof", 50 * MB, [{ kind: "proof", declared_bytes: 300 * MB, created_at: ago(DAY_MS + 1) }], now)).toBe("ok");
  });
  it("10 avatar uploads per rolling day", () => {
    const nine = Array.from({ length: AVATAR_UPLOADS_PER_DAY - 1 }, () => ({ kind: "avatar" as const, declared_bytes: 1000, created_at: ago(60_000) }));
    expect(checkUploadBudget("avatar", 1000, nine, now)).toBe("ok");
    expect(checkUploadBudget("avatar", 1000, [...nine, nine[0]], now)).toBe("avatar-budget");
  });
  it("a proof upload URL needs a capture sessionId and role; a poster must be a JPEG", () => {
    const sid = "3f6b1b5e-2a8c-4c3e-9a51-0f2f7a2d9b10";
    expect(uploadRequestSchema.safeParse({ kind: "proof", mime: "image/jpeg", size: 1000 }).success).toBe(false);
    expect(uploadRequestSchema.safeParse({ kind: "proof", mime: "image/jpeg", size: 1000, sessionId: sid, role: "media" }).success).toBe(true);
    expect(uploadRequestSchema.safeParse({ kind: "proof", mime: "video/mp4", size: 1000, sessionId: sid, role: "poster" }).success).toBe(false);
    expect(uploadRequestSchema.safeParse({ kind: "avatar", mime: "image/png", size: 1000 }).success).toBe(true);
  });
  it("daily cleanup deletes only unreferenced objects older than 24 h", () => {
    const objects = [
      { path: "proof/a/kept.jpg", createdAt: ago(5 * DAY_MS) },
      { path: "proof/a/orphan-old.jpg", createdAt: ago(DAY_MS + 1000) },
      { path: "proof/a/orphan-new.jpg", createdAt: ago(3_600_000) },
      { path: "proof/a/poster-old.jpg", createdAt: ago(2 * DAY_MS) },
    ];
    expect(staleObjects(objects, new Set(["proof/a/kept.jpg"]), now)).toEqual(["proof/a/orphan-old.jpg", "proof/a/poster-old.jpg"]);
  });
});

describe("reports: auto-hide thresholds and per-viewer hiding", () => {
  const r = (user: string, at = "2026-11-07T10:00:00Z") => ({ reporter_user_id: user, created_at: at });
  it("2 different reporters hide in a public wifie, 3 in a private one", () => {
    expect(hideThreshold(true)).toBe(2);
    expect(hideThreshold(false)).toBe(3);
    expect(shouldAutoHide([r("a")], true, null)).toBe(false);
    expect(shouldAutoHide([r("a"), r("b")], true, null)).toBe(true);
    expect(shouldAutoHide([r("a"), r("b")], false, null)).toBe(false);
    expect(shouldAutoHide([r("a"), r("b"), r("c")], false, null)).toBe(true);
  });
  it("the same person reporting twice counts once", () => {
    expect(shouldAutoHide([r("a"), r("a")], true, null)).toBe(false);
  });
  it("after an admin clears it, only newer reports count", () => {
    const cleared = "2026-11-07T11:00:00Z";
    expect(shouldAutoHide([r("a"), r("b")], true, cleared)).toBe(false);
    expect(shouldAutoHide([r("a"), r("b", "2026-11-07T11:30:00Z"), r("c", "2026-11-07T11:40:00Z")], true, cleared)).toBe(true);
  });
  it("hidden for everyone once hidden; hidden for the reporter immediately", () => {
    expect(hiddenFor({ id: 5, text_hidden_at: null, media_hidden_at: null }, new Set())).toEqual({ textHidden: false, mediaHidden: false });
    expect(hiddenFor({ id: 5, text_hidden_at: null, media_hidden_at: null }, new Set(["5:proof"]))).toEqual({ textHidden: false, mediaHidden: true });
    expect(hiddenFor({ id: 5, text_hidden_at: "2026-11-07T00:00:00Z", media_hidden_at: null }, new Set())).toEqual({ textHidden: true, mediaHidden: false });
    expect(hiddenFor({ id: 5, text_hidden_at: null, media_hidden_at: null }, new Set(["6:dare"])).textHidden).toBe(false);
  });
  it("hiding changes the public share-card version (fresh cache key)", () => {
    const d = { state: "Settled", outcome: "Passed", proof_hash: H };
    expect(cardVersion(d)).not.toBe(cardVersion({ ...d, media_hidden_at: "2026-11-07T00:00:00Z" }));
    expect(cardVersion({ ...d, text_hidden_at: "x" })).toMatch(/-ht$/);
  });
});

describe("admin auth (ADMIN_WALLETS)", () => {
  const env = " 0x00000000000000000000000000000000000000AA ,not-a-wallet,0x00000000000000000000000000000000000000bb ";
  it("parses a comma list, lowercases, drops junk", () => {
    expect([...adminWallets(env)]).toEqual(["0x00000000000000000000000000000000000000aa", "0x00000000000000000000000000000000000000bb"]);
    expect(adminWallets(undefined).size).toBe(0);
  });
  it("admin if ANY linked wallet is listed; nobody when the env is unset", () => {
    expect(isAdmin({ wallets: ["0x00000000000000000000000000000000000000Aa" as `0x${string}`] }, env)).toBe(true);
    expect(isAdmin({ wallets: [VICTIM as `0x${string}`, "0x00000000000000000000000000000000000000bb" as `0x${string}`] }, env)).toBe(true);
    expect(isAdmin({ wallets: [VICTIM as `0x${string}`] }, env)).toBe(false);
    expect(isAdmin({ wallets: [VICTIM as `0x${string}`] }, "")).toBe(false);
  });
});

describe("public wifie permits: one wallet per account, 10-minute account age", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  const base = { blocked: false, accountCreatedAt: now - PUBLIC_MIN_ACCOUNT_AGE_MS, now, existingWallet: null, wallet: VICTIM };
  it("ok for an account 10+ minutes old, first wallet or the same wallet again", () => {
    expect(checkPublicPermit(base)).toBe("ok");
    expect(checkPublicPermit({ ...base, existingWallet: VICTIM.toUpperCase().replace("0X", "0x") })).toBe("ok");
  });
  it("refuses a second wallet, a brand-new or unknown-age account, and blocked profiles", () => {
    expect(checkPublicPermit({ ...base, existingWallet: ATTACKER })).toBe("other-wallet");
    expect(checkPublicPermit({ ...base, accountCreatedAt: now - PUBLIC_MIN_ACCOUNT_AGE_MS + 1 })).toBe("too-new");
    expect(checkPublicPermit({ ...base, accountCreatedAt: null })).toBe("too-new");
    expect(checkPublicPermit({ ...base, blocked: true })).toBe("blocked");
  });
});

describe("M-5 / L-6: resilient sync", () => {
  const log = (eventName: string, args: Record<string, unknown>): EscrowLog => ({ eventName, args, blockNumber: BigInt(10), transactionHash: `0x${"11".repeat(32)}`, logIndex: 0 });
  it("malformed tracked events are skipped (and listed), unknown events ignored", () => {
    expect(wellFormed(log("Voted", { dareId: BigInt(1), voter: VICTIM, pass: true }))).toBe(true);
    expect(wellFormed(log("Voted", { dareId: BigInt(0), voter: VICTIM, pass: true }))).toBe(false);
    expect(wellFormed(log("DareSettled", { dareId: BigInt(1), payout: BigInt(5) }))).toBe(false); // no burned
    expect(wellFormed(log("Paused", {}))).toBe(true);
    const t = collectTouched([log("MemberJoined", { groupId: BigInt(1), member: "nope" }), log("GroupCreated", { groupId: BigInt(2), creator: VICTIM })]);
    expect(t.skipped).toHaveLength(1);
    expect(t.members).toHaveLength(0);
    expect([...t.groups.keys()]).toEqual([BigInt(2)]);
  });
  it("reads stop 3 blocks behind the head", () => {
    expect(CONFIRMATIONS).toBe(BigInt(3));
    expect(safeHead(BigInt(108_400_000))).toBe(BigInt(108_399_997));
    expect(safeHead(BigInt(2))).toBe(BigInt(0));
  });
  it("splits a refused range into two halves that cover it exactly", () => {
    expect(splitRange([BigInt(1), BigInt(10)])).toEqual([
      [BigInt(1), BigInt(5)],
      [BigInt(6), BigInt(10)],
    ]);
    expect(splitRange([BigInt(7), BigInt(7)])).toEqual([[BigInt(7), BigInt(7)]]);
  });
});
