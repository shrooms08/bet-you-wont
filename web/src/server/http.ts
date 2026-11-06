// Small HTTP helpers shared by every API route. No secrets here.
import { connection } from "next/server";
import { ZodError } from "zod";
import { firstIssue } from "./validation";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** BigInt-safe JSON: bigint becomes a decimal string. */
export function ok(body: unknown) {
  return new Response(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Wraps a route handler: ApiError -> its status, ZodError -> 400, anything else -> 500 (logged, not leaked). */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiError) return json(err.status, { error: err.message });
      if (err instanceof ZodError) return json(400, { error: firstIssue(err) });
      console.error("[api] unexpected error:", err instanceof Error ? err.message : String(err));
      return json(500, { error: "Something went wrong on our side. Try again." });
    }
  };
}

/**
 * For GET handlers. With cacheComponents a GET handler is prerendered at build time unless it reads
 * request data, so this awaits connection() first. It sits outside route()'s try/catch on purpose:
 * during the build, connection() rejects to stop the prerender, and that signal must reach Next.
 */
export function getRoute<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  const wrapped = route(handler);
  return async (...args: A): Promise<Response> => {
    await connection();
    return wrapped(...args);
  };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Body must be JSON.");
  }
}

/** Best-effort client IP for public rate limits. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
