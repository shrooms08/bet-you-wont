import { timingSafeEqual } from "node:crypto";
import { ApiError, getRoute, ok } from "@/server/http";
import { avatarPathFromUrl, UPLOAD_RULES } from "@/server/media";
import { proofBelongsTo, type ProofRow } from "@/server/proofMatch";
import { selectAll } from "@/server/selectAll";
import { db } from "@/server/supabase";
import { DAY_MS, staleObjects } from "@/server/uploadRules";

export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // not configured: refuse rather than run unauthenticated
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Every object under <bucket>/<kind>/<wallet>/..., with its creation time. */
async function listObjects(bucket: string, kind: "proof" | "avatar") {
  const out: Array<{ path: string; createdAt: string | null }> = [];
  const store = db().storage.from(bucket);
  const page = async (prefix: string) => {
    const items: Array<{ name: string; id: string | null; created_at: string | null }> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await store.list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
      items.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return items;
  };
  for (const folder of await page(kind)) {
    if (folder.id !== null) continue; // folders have no id
    for (const f of await page(`${kind}/${folder.name}`)) {
      if (f.id !== null) out.push({ path: `${kind}/${folder.name}/${f.name}`, createdAt: f.created_at });
    }
  }
  return out;
}

async function removeAll(bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db().storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`remove from ${bucket}: ${error.message}`);
  }
}

// GET /api/cron/cleanup: Vercel Cron, once a day (vercel.json). Needs `Authorization: Bearer
// $CRON_SECRET` (Vercel sends it when CRON_SECRET is set). M-4: deletes proof files and posters
// not linked to a dare's finalized proof after 24 h, proof rows that never went onchain, expired
// capture sessions, unreferenced avatars, and old ledger / rate-limit rows.
export const GET = getRoute(async (request: Request) => {
  if (!authorized(request)) throw new ApiError(401, "unauthorized");
  const now = Date.now();
  const dayAgo = new Date(now - DAY_MS).toISOString();

  // proofs that belong to their dare (same rule as the feed: H-2)
  const proofRows = await selectAll<ProofRow & { created_at: string; session_id: string | null }>(
    "proofs",
    "proof_hash, dare_id, uploader_wallet, storage_path, mime, kind, poster_path, captured_at, duration_ms, deleted_at, created_at, session_id",
    "proof_hash",
  );
  const dareIds = [...new Set(proofRows.map((r) => String(r.dare_id)))];
  const dares = new Map<string, { id: string; proof_hash: string | null; doer_wallet: string | null }>();
  for (let i = 0; i < dareIds.length; i += 200) {
    const { data, error } = await db().from("dares").select("id, proof_hash, doer_wallet").in("id", dareIds.slice(i, i + 200));
    if (error) throw new ApiError(502, "Database error while loading dares.");
    for (const d of data ?? []) dares.set(String(d.id), { id: String(d.id), proof_hash: d.proof_hash, doer_wallet: d.doer_wallet });
  }
  const linked = proofRows.filter((r) => {
    const d = dares.get(String(r.dare_id));
    return !!d && proofBelongsTo(r, d);
  });
  const keepProofs = new Set(linked.flatMap((r) => [r.storage_path!, ...(r.poster_path ? [r.poster_path] : [])]));
  // proof rows whose hash never went onchain (or whose file an admin deleted), older than a day
  const deadRows = proofRows.filter((r) => !linked.includes(r) && Date.parse(r.created_at) < now - DAY_MS).map((r) => r.proof_hash);

  const proofObjects = await listObjects(UPLOAD_RULES.proof.bucket, "proof");
  const staleProofs = staleObjects(proofObjects, keepProofs, now);
  await removeAll(UPLOAD_RULES.proof.bucket, staleProofs);
  for (let i = 0; i < deadRows.length; i += 200) await db().from("proofs").delete().in("proof_hash", deadRows.slice(i, i + 200));

  const profiles = await selectAll<{ avatar_url: string | null }>("profiles", "avatar_url", "privy_user_id");
  const keepAvatars = new Set(profiles.map((p) => avatarPathFromUrl(p.avatar_url)).filter((p): p is string => !!p));
  const staleAvatars = staleObjects(await listObjects(UPLOAD_RULES.avatar.bucket, "avatar"), keepAvatars, now);
  await removeAll(UPLOAD_RULES.avatar.bucket, staleAvatars);

  // expired capture sessions that no proof row points at
  const usedSessions = new Set(proofRows.map((r) => r.session_id).filter(Boolean));
  const { data: expired } = await db().from("proof_sessions").select("id").lt("expires_at", dayAgo);
  const expiredIds = (expired ?? []).map((s) => s.id as string).filter((id) => !usedSessions.has(id));
  for (let i = 0; i < expiredIds.length; i += 200) await db().from("proof_sessions").delete().in("id", expiredIds.slice(i, i + 200));

  const removed = [...staleProofs, ...staleAvatars];
  for (let i = 0; i < removed.length; i += 200) await db().from("uploads").update({ status: "deleted" }).in("path", removed.slice(i, i + 200));
  await db().from("uploads").delete().lt("created_at", new Date(now - 7 * DAY_MS).toISOString());
  await db().from("rate_limits").delete().lt("window_start", dayAgo);

  const result = { proofFiles: staleProofs.length, deadProofRows: deadRows.length, avatars: staleAvatars.length, sessions: expiredIds.length };
  console.log("[cron cleanup]", JSON.stringify(result));
  return ok(result);
});
