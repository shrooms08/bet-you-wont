import "server-only";
import { check, db } from "./supabase";

/**
 * Every row of a table, read in pages (L-9): PostgREST caps a single response (1,000 rows by
 * default), which silently truncated scores and leaderboards. Ordered by a unique column so pages
 * never overlap or skip.
 */
export async function selectAll<T>(table: string, columns: string, orderBy: string, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  const keys = orderBy.split(",").map((k) => k.trim()); // the (unique) key, e.g. "dare_id,voter_wallet"
  for (let from = 0; ; from += pageSize) {
    let q = db().from(table).select(columns);
    for (const k of keys) q = q.order(k, { ascending: true });
    const rows = check(
      await q.range(from, from + pageSize - 1),
      `loading ${table}`,
    ) as unknown as T[];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}
