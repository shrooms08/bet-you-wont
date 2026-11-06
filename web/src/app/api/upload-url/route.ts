import { randomUUID } from "node:crypto";
import { requireCaller } from "@/server/auth";
import { ApiError, ok, readJson, route } from "@/server/http";
import { storagePathFor, UPLOAD_RULES } from "@/server/media";
import { enforceRateLimit } from "@/server/rateLimit";
import { db } from "@/server/supabase";
import { uploadRequestSchema } from "@/server/validation";

// POST /api/upload-url {kind, mime, size}: auth. Returns a one-time signed upload URL for
// <kind>/<wallet>/<uuid>.<ext> in the matching bucket. The bucket enforces size and mime again.
export const POST = route(async (request: Request) => {
  const caller = await requireCaller(request);
  const body = uploadRequestSchema.parse(await readJson(request));
  await enforceRateLimit(`upload-url:${caller.userId}`, 30, 3600, "Too many uploads.");

  const rule = UPLOAD_RULES[body.kind];
  const path = storagePathFor(body.kind, caller.wallet, randomUUID(), body.mime);
  const { data, error } = await db().storage.from(rule.bucket).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[upload-url]", error?.message);
    throw new ApiError(502, "Could not create an upload URL. Try again.");
  }
  return ok({ bucket: rule.bucket, path, signedUrl: data.signedUrl, token: data.token, maxBytes: rule.maxBytes });
});
