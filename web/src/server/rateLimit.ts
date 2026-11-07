import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./http";
import { db } from "./supabase";

// Fixed-window rate limiter backed by Postgres (public.rate_limit_hit in 001_init.sql), so the
// limit holds across restarts and across server instances.

export type RateState = { count: number; windowStart: number /* ms */ };
export type RateDecision = { allowed: boolean; hits: number; resetAt: number /* ms */ };

/**
 * Reference model of the SQL function, used by unit tests and documented here so the two stay in
 * sync: a hit inside the window increments the count; a hit at or after windowStart + window opens
 * a new window with count 1. A hit is allowed while count <= limit.
 */
export function decideHit(prev: RateState | null, now: number, limit: number, windowSeconds: number) {
  const windowMs = windowSeconds * 1000;
  const fresh = !prev || prev.windowStart <= now - windowMs;
  const state: RateState = fresh ? { count: 1, windowStart: now } : { count: prev.count + 1, windowStart: prev.windowStart };
  const decision: RateDecision = { allowed: state.count <= limit, hits: state.count, resetAt: state.windowStart + windowMs };
  return { state, decision };
}

/** Counts one hit for `key`. Fails closed: if the database is unreachable the request is refused. */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  client: Pick<SupabaseClient, "rpc"> = db(),
): Promise<RateDecision> {
  const { data, error } = await client.rpc("rate_limit_hit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    console.error("[ratelimit] rpc failed:", error?.message ?? "no row");
    throw new ApiError(503, "Rate limiter unavailable. Try again in a moment.");
  }
  return { allowed: Boolean(row.allowed), hits: Number(row.hits), resetAt: Date.parse(row.reset_at) };
}

/**
 * Limits for routes that can trigger a sync or are polled (M-6). Signed-in routes are keyed per
 * user (people on one venue Wi-Fi share an IP); every route also has a per-IP ceiling.
 */
export async function enforceRouteLimit(name: string, ip: string, userId: string | null, perUserPerMin = 30, perIpPerMin = 120) {
  if (userId) await enforceRateLimit(`${name}:u:${userId}`, perUserPerMin, 60, "Slow down a little.");
  await enforceRateLimit(`${name}:ip:${ip}`, userId ? perIpPerMin : perUserPerMin, 60, "Slow down a little.");
}

/** Throws 429 when over the limit. */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  message: string,
  client?: Pick<SupabaseClient, "rpc">,
) {
  const d = await rateLimit(key, limit, windowSeconds, client);
  if (!d.allowed) {
    const mins = Math.max(1, Math.ceil((d.resetAt - Date.now()) / 60_000));
    throw new ApiError(429, `${message} Try again in about ${mins} min.`);
  }
}
