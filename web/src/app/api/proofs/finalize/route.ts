import { ownsWallet, requireCaller } from "@/server/auth";
import { requireAdult } from "@/server/age";
import { getDareOnchain } from "@/server/chain";
import { proofHashOf } from "@/server/hashing";
import { ApiError, ok, readJson, route } from "@/server/http";
import { magicMatches, parseStoragePath, UPLOAD_RULES } from "@/server/media";
import { checkSession, SESSION_ERRORS, type SessionRow } from "@/server/proofSession";
import { enforceRateLimit } from "@/server/rateLimit";
import { check, db, publicUrl } from "@/server/supabase";
import { finalizeProofSchema as bodySchema } from "@/server/validation";

const ACCEPTED = 2; // DareState.Accepted
const MIME_FOR_KIND = { photo: ["image/jpeg"], video: ["video/mp4", "video/webm"] } as const;

async function download(path: string) {
  const { data: blob, error } = await db().storage.from(UPLOAD_RULES.proof.bucket).download(path);
  if (error || !blob) throw new ApiError(404, "Upload the file first, then finalize.");
  return blob;
}

// POST /api/proofs/finalize: auth, doer only, needs a valid capture session for this dare.
// Checks the uploaded capture (JPEG photo or MP4/WebM video, plus a JPEG poster for videos) and
// returns its sha256 as the proofHash. The client then calls submitProof(dareId, proofHash).
export const POST = route(async (request: Request) => {
  const caller = await requireCaller(request);
  await requireAdult(caller);
  const body = bodySchema.parse(await readJson(request));
  await enforceRateLimit(`finalize:${caller.userId}`, 20, 3600, "Too many proof uploads.");

  const path = parseStoragePath(body.storagePath);
  if (!path || path.kind !== "proof") throw new ApiError(400, "storagePath must be a proof path from /api/upload-url.");

  const dare = await getDareOnchain(body.dareId);
  if (dare.state !== ACCEPTED) throw new ApiError(409, "This dare is not waiting for proof.");
  if (!ownsWallet(caller, dare.doer) || path.wallet !== dare.doer.toLowerCase()) {
    throw new ApiError(403, "Only the dare's doer can post proof, from the wallet that accepted it.");
  }
  if (BigInt(Math.floor(Date.now() / 1000)) > dare.proofDeadline) throw new ApiError(409, "The proof deadline has passed.");

  // the capture session: right dare, right user and wallet, not expired
  const session = (check(
    await db().from("proof_sessions").select("*").eq("id", body.sessionId).limit(1),
    "loading capture session",
  ) as SessionRow[])[0];
  const verdict = checkSession(session, { dareId: body.dareId, wallet: dare.doer, userId: caller.userId, now: Date.now() });
  if (verdict !== "ok") throw new ApiError(verdict === "missing" ? 404 : 403, SESSION_ERRORS[verdict]);

  const rule = UPLOAD_RULES.proof;
  const blob = await download(body.storagePath);
  const mime = blob.type.split(";")[0];
  if (!(MIME_FOR_KIND[body.kind] as readonly string[]).includes(mime) || rule.mimes[mime] !== path.ext) {
    throw new ApiError(400, "Proof must be a photo (JPEG) or clip (MP4/WebM) from the in-app camera.");
  }
  if (blob.size > rule.maxBytes) throw new ApiError(400, "Proof files must be 50 MB or smaller.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!magicMatches(mime, bytes.subarray(0, 16))) throw new ApiError(400, `That file is not really ${mime}.`);

  // videos carry a JPEG poster (first frame with the receipt)
  let posterPath: string | null = null;
  if (body.kind === "video") {
    const poster = body.posterPath ? parseStoragePath(body.posterPath) : null;
    if (!poster || poster.kind !== "proof" || poster.wallet !== path.wallet || poster.ext !== "jpg") {
      throw new ApiError(400, "Videos need a poster image from the same capture.");
    }
    const pblob = await download(body.posterPath!);
    const head = new Uint8Array(await pblob.slice(0, 16).arrayBuffer());
    if (pblob.type.split(";")[0] !== "image/jpeg" || !magicMatches("image/jpeg", head) || pblob.size > 5 * 1024 * 1024) {
      throw new ApiError(400, "The video poster must be a JPEG under 5 MB.");
    }
    posterPath = body.posterPath!;
  }

  const proofHash = proofHashOf(bytes);
  const existing = check(
    await db().from("proofs").select("dare_id").eq("proof_hash", proofHash).limit(1),
    "checking proof",
  ) as Array<{ dare_id: number }>;
  if (existing[0] && Number(existing[0].dare_id) !== Number(body.dareId)) {
    throw new ApiError(409, `This exact file was already used as proof for dare ${existing[0].dare_id}.`);
  }
  const { error: upsertError } = await db().from("proofs").upsert(
    {
      proof_hash: proofHash,
      dare_id: body.dareId.toString(),
      uploader_wallet: dare.doer.toLowerCase(),
      storage_path: body.storagePath,
      mime,
      size_bytes: blob.size,
      captured_at: body.capturedAt,
      kind: body.kind,
      duration_ms: body.durationMs ?? null,
      poster_path: posterPath,
      session_id: body.sessionId,
    },
    { onConflict: "proof_hash" },
  );
  if (upsertError) {
    console.error("[finalize] upsert:", upsertError.message);
    throw new ApiError(502, "Database error while saving the proof.");
  }
  await db().from("proof_sessions").update({ used_at: new Date().toISOString() }).eq("id", body.sessionId);

  return ok({ proofHash, url: publicUrl(rule.bucket, body.storagePath), mime, kind: body.kind, sizeBytes: blob.size });
});
