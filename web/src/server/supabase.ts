import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "./env";
import { ApiError } from "./http";

// Admin client with the Supabase secret key. Bypasses RLS: server code only.
// The `server-only` import above makes any client-component import of this file fail the build.

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  client ??= createClient(serverEnv.supabaseUrl(), serverEnv.supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/** Throws a 502 ApiError for a Supabase error, logging only its message. */
export function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) {
    console.error(`[db] ${what}:`, result.error.message);
    throw new ApiError(502, `Database error while ${what}. Try again.`);
  }
  return result.data;
}

export function publicUrl(bucket: string, path: string): string {
  return db().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
