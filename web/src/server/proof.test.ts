import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, paginate } from "./feedCursor";
import { checkSession, newSessionCode, SESSION_ALPHABET, SESSION_TTL_MS, type SessionRow } from "./proofSession";
import { toggleReaction, type ReactionStore } from "./reactions";

describe("capture session validation", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const s: SessionRow = {
    id: "8a1d6b0e-0000-4000-8000-000000000001",
    dare_id: 12,
    wallet_address: "0xabc0000000000000000000000000000000000001",
    privy_user_id: "did:privy:juju",
    code: "K7M2PQ",
    issued_at: new Date(now - 60_000).toISOString(),
    expires_at: new Date(now - 60_000 + SESSION_TTL_MS).toISOString(),
  };
  const ctx = { dareId: 12, wallet: "0xABC0000000000000000000000000000000000001", userId: "did:privy:juju", now };
  it("accepts the right dare, user and wallet inside 15 minutes", () => {
    expect(checkSession(s, ctx)).toBe("ok");
    expect(checkSession(s, { ...ctx, dareId: BigInt(12) })).toBe("ok");
  });
  it("rejects missing, wrong dare, wrong user, wrong wallet, expired", () => {
    expect(checkSession(null, ctx)).toBe("missing");
    expect(checkSession(s, { ...ctx, dareId: 13 })).toBe("wrong-dare");
    expect(checkSession(s, { ...ctx, userId: "did:privy:someone" })).toBe("wrong-user");
    expect(checkSession(s, { ...ctx, wallet: "0xdef0000000000000000000000000000000000002" })).toBe("wrong-user");
    expect(checkSession(s, { ...ctx, now: Date.parse(s.expires_at) })).toBe("expired");
    expect(checkSession(s, { ...ctx, now: now + SESSION_TTL_MS })).toBe("expired");
  });
  it("codes are 6 unambiguous uppercase characters", () => {
    for (let i = 0; i < 100; i++) {
      const c = newSessionCode();
      expect(c).toMatch(/^[A-Z0-9]{6}$/);
      expect([...c].every((ch) => SESSION_ALPHABET.includes(ch))).toBe(true);
      expect(c).not.toMatch(/[01IOL]/);
    }
  });
});

describe("feed cursor and pagination", () => {
  it("round-trips (activity_at, id) and rejects junk", () => {
    const c = { at: "2026-11-06T12:00:00.000Z", id: 41 };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(Buffer.from("2026-11-06T12:00:00Z|-3").toString("base64url"))).toBeNull();
  });
  it("returns pageSize items and a cursor at the last one only when more rows exist", () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ id: 100 - i, activity_at: new Date(Date.UTC(2026, 10, 6, 12, 0, 0) - i * 60_000).toISOString() }));
    const { page, next } = paginate(rows, 10);
    expect(page).toHaveLength(10);
    expect(decodeCursor(next)).toEqual({ at: rows[9].activity_at, id: 91 });
    expect(paginate(rows.slice(0, 10), 10).next).toBeNull();
    expect(paginate([], 10)).toEqual({ page: [], next: null });
  });
});

describe("reaction toggle", () => {
  function memoryStore(): ReactionStore & { rows: Set<string> } {
    const rows = new Set<string>();
    return {
      rows,
      remove: async (d, w) => rows.delete(`${d}|${w}`),
      insert: async (d, w) => void rows.add(`${d}|${w}`),
      count: async (d) => [...rows].filter((r) => r.startsWith(`${d}|`)).length,
    };
  }
  it("adds on first tap, removes on the second, counts per dare, lowercases wallets", async () => {
    const store = memoryStore();
    expect(await toggleReaction(store, "7", "0xAAA")).toEqual({ reacted: true, count: 1 });
    expect(await toggleReaction(store, "7", "0xbbb")).toEqual({ reacted: true, count: 2 });
    expect(await toggleReaction(store, "8", "0xaaa")).toEqual({ reacted: true, count: 1 });
    expect(await toggleReaction(store, "7", "0xaaa")).toEqual({ reacted: false, count: 1 });
    expect(store.rows.has("7|0xaaa")).toBe(false);
  });
});
