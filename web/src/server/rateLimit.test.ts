import { describe, expect, it } from "vitest";
import { ApiError } from "./http";
import { decideHit, enforceRateLimit, rateLimit, type RateState } from "./rateLimit";

describe("decideHit (reference model of public.rate_limit_hit)", () => {
  const WINDOW = 3600;
  it("allows `limit` hits per window, then refuses", () => {
    let state: RateState | null = null;
    const results: boolean[] = [];
    for (let i = 0; i < 12; i++) {
      const r = decideHit(state, 1_000_000 + i * 1000, 10, WINDOW);
      state = r.state;
      results.push(r.decision.allowed);
    }
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(results.slice(10)).toEqual([false, false]);
    expect(state!.count).toBe(12);
  });

  it("opens a fresh window exactly when the old one has elapsed (fixed, not sliding)", () => {
    const start = 5_000_000;
    let state = decideHit(null, start, 1, WINDOW).state;
    expect(decideHit(state, start + WINDOW * 1000 - 1, 1, WINDOW).decision.allowed).toBe(false);
    const fresh = decideHit(state, start + WINDOW * 1000, 1, WINDOW);
    expect(fresh.decision).toEqual({ allowed: true, hits: 1, resetAt: start + 2 * WINDOW * 1000 });
    state = fresh.state;
    expect(state.windowStart).toBe(start + WINDOW * 1000);
  });

  it("reports when the window resets", () => {
    expect(decideHit(null, 0, 5, 60).decision.resetAt).toBe(60_000);
  });
});

describe("rateLimit wrapper", () => {
  const fake = (data: unknown, error: { message: string } | null = null) =>
    ({ rpc: async () => ({ data, error }) }) as never;

  it("passes the SQL function's decision through", async () => {
    const d = await rateLimit("k", 10, 60, fake([{ allowed: true, hits: 3, reset_at: "2026-11-06T12:00:00Z" }]));
    expect(d).toEqual({ allowed: true, hits: 3, resetAt: Date.parse("2026-11-06T12:00:00Z") });
  });

  it("fails closed with a 503 when the database errors", async () => {
    await expect(rateLimit("k", 10, 60, fake(null, { message: "down" }))).rejects.toMatchObject({ status: 503 });
  });

  it("enforceRateLimit throws 429 when over the limit", async () => {
    const reset = new Date(Date.now() + 5 * 60_000).toISOString();
    const err = await enforceRateLimit("k", 10, 3600, "Too many.", fake([{ allowed: false, hits: 11, reset_at: reset }])).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).message).toMatch(/Too many\. Try again in about 5 min\./);
  });
});
