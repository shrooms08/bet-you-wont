import { randomUUID } from "node:crypto";
import { requireAdult } from "@/server/age";
import { requireCaller } from "@/server/auth";
import { ApiError, ok, readJson, route } from "@/server/http";
import { storagePathFor, UPLOAD_RULES } from "@/server/media";
import { checkSession, SESSION_ERRORS, type SessionRow } from "@/server/proofSession";
import { enforceRateLimit } from "@/server/rateLimit";
import { check, db } from "@/server/supabase";
import { BUDGET_ERRORS, checkUploadBudget, DAY_MS, type UploadLedgerRow } from "@/server/uploadRules";
import { uploadRequestSchema } from "@/server/validation";

// POST /api/upload-url {kind, mime, size, sessionId?, role?}: auth. Returns a one-time signed upload
// URL for <kind>/<wallet>/<uuid>.<ext> in the matching bucket. The bucket enforces size and mime again.
//
// M-4: a proof upload needs an active, unused capture session the caller owns, and each session has
// at most one in-flight upload per role (the media file, and a video's poster): asking again (a
// retake) deletes the previous file. Every issued URL counts toward a per-user daily budget.
export const POST = route(async (request: Request) => {
  const caller = await requireCaller(request);
  const body = uploadRequestSchema.parse(await readJson(request));
  await requireAdult(caller, { allowNoProfile: body.kind === "avatar" });
  await enforceRateLimit(`upload-url:${caller.userId}`, 30, 3600, "Too many uploads.");
  const wallet = caller.wallet.toLowerCase();
  const now = Date.now();

  if (body.kind === "proof") {
    const session = (check(
      await db().from("proof_sessions").select("*").eq("id", body.sessionId!).limit(1),
      "loading capture session",
    ) as SessionRow[])[0];
    const verdict = checkSession(session, { dareId: Number(session?.dare_id ?? 0), wallet, userId: caller.userId, now });
    if (verdict !== "ok") throw new ApiError(verdict === "missing" ? 404 : 403, SESSION_ERRORS[verdict]);
  }

  const recent = check(
    await db()
      .from("uploads")
      .select("kind, declared_bytes, created_at")
      .eq("privy_user_id", caller.userId)
      .gte("created_at", new Date(now - DAY_MS).toISOString()),
    "checking your upload budget",
  ) as UploadLedgerRow[];
  const budget = checkUploadBudget(body.kind, body.size, recent, now);
  if (budget !== "ok") throw new ApiError(429, BUDGET_ERRORS[budget]);

  const rule = UPLOAD_RULES[body.kind];
  if (body.kind === "proof") {
    // retake: drop the previous in-flight file for this session + role
    const previous = check(
      await db().from("uploads").select("id, path").eq("session_id", body.sessionId!).eq("role", body.role!).eq("status", "issued"),
      "loading previous upload",
    ) as Array<{ id: string; path: string }>;
    if (previous.length) {
      const { error } = await db().storage.from(rule.bucket).remove(previous.map((p) => p.path));
      if (error) console.error("[upload-url] removing retaken upload:", error.message);
      await db().from("uploads").update({ status: "deleted" }).in("id", previous.map((p) => p.id));
    }
  }

  const path = storagePathFor(body.kind, wallet, randomUUID(), body.mime);
  const { error: ledgerError } = await db().from("uploads").insert({
    privy_user_id: caller.userId,
    wallet_address: wallet,
    kind: body.kind,
    path,
    declared_bytes: body.size,
    session_id: body.kind === "proof" ? body.sessionId : null,
    role: body.kind === "proof" ? body.role : null,
  });
  if (ledgerError) {
    console.error("[upload-url] ledger:", ledgerError.message);
    throw new ApiError(502, "Could not create an upload URL. Try again.");
  }
  const { data, error } = await db().storage.from(rule.bucket).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[upload-url]", error?.message);
    throw new ApiError(502, "Could not create an upload URL. Try again.");
  }
  return ok({ bucket: rule.bucket, path, signedUrl: data.signedUrl, token: data.token, maxBytes: rule.maxBytes });
});
