import { z } from "zod";
import { crewAccess } from "@/server/access";
import { requireCaller } from "@/server/auth";
import { dropSignedUrls } from "@/server/dareView";
import { ApiError, ok, readJson, route } from "@/server/http";
import { REPORT_REASONS, shouldAutoHide } from "@/server/moderationRules";
import { enforceRateLimit } from "@/server/rateLimit";
import { check, db } from "@/server/supabase";
import { idSchema } from "@/server/validation";

const bodySchema = z.object({
  dareId: idSchema,
  target: z.enum(["dare", "proof"]),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(280).optional(),
});

// POST /api/reports {dareId, target, reason, details?}: auth, anyone who can see the dare. The
// reporter stops seeing it at once. After 2 different reporters (public wifie) or 3 (private) the
// dare text ("dare") or proof media ("proof") is hidden for everyone until an admin reviews it.
export const POST = route(async (request: Request) => {
  const caller = await requireCaller(request);
  const body = bodySchema.parse(await readJson(request));
  await enforceRateLimit(`report:${caller.userId}`, 20, 3600, "Too many reports.");
  const dareId = Number(body.dareId);
  const me = caller.wallet.toLowerCase();

  const dare = (check(
    await db().from("dares").select("id, group_id, proof_hash, text_hidden_at, text_cleared_at, media_hidden_at, media_cleared_at").eq("id", dareId).limit(1),
    "loading dare",
  ) as Array<{ id: number; group_id: number; proof_hash: string | null; text_hidden_at: string | null; text_cleared_at: string | null; media_hidden_at: string | null; media_cleared_at: string | null }>)[0];
  if (!dare) throw new ApiError(404, "No dare with that number.");
  const access = await crewAccess(Number(dare.group_id), me);
  if (!access.canSee) throw new ApiError(404, "this dare is private");
  if (body.target === "proof" && !dare.proof_hash) throw new ApiError(400, "This dare has no proof to report.");

  const { error } = await db().from("reports").insert({
    dare_id: dareId,
    target: body.target,
    reason: body.reason,
    details: body.details || null,
    reporter_user_id: caller.userId,
    reporter_wallet: me,
  });
  if (error && error.code !== "23505") {
    console.error("[reports] insert:", error.message);
    throw new ApiError(502, "Database error while saving the report.");
  }

  const reports = check(
    await db().from("reports").select("reporter_user_id, created_at").eq("dare_id", dareId).eq("target", body.target),
    "counting reports",
  ) as Array<{ reporter_user_id: string; created_at: string }>;
  const isText = body.target === "dare";
  const alreadyHidden = isText ? !!dare.text_hidden_at : !!dare.media_hidden_at;
  let hiddenForAll = alreadyHidden;
  if (!alreadyHidden && shouldAutoHide(reports, access.isPublic, isText ? dare.text_cleared_at : dare.media_cleared_at)) {
    const now = new Date().toISOString();
    await db()
      .from("dares")
      .update(isText ? { text_hidden_at: now, text_hidden_by: "auto" } : { media_hidden_at: now, media_hidden_by: "auto" })
      .eq("id", dareId);
    if (!isText) {
      const paths = check(await db().from("proofs").select("storage_path, poster_path").eq("dare_id", dareId), "loading proof") as Array<{ storage_path: string | null; poster_path: string | null }>;
      dropSignedUrls(paths.flatMap((p) => [p.storage_path, p.poster_path]));
    }
    hiddenForAll = true;
  }
  return ok({ reported: true, duplicate: error?.code === "23505", hiddenForYou: true, hiddenForAll });
});
