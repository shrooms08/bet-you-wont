import { ownsWallet, requireCaller } from "@/server/auth";
import { getDareOnchain } from "@/server/chain";
import { proofHashOf } from "@/server/hashing";
import { ApiError, ok, readJson, route } from "@/server/http";
import { magicMatches, parseStoragePath, UPLOAD_RULES } from "@/server/media";
import { enforceRateLimit } from "@/server/rateLimit";
import { check, db, publicUrl } from "@/server/supabase";
import { finalizeProofSchema } from "@/server/validation";

const ACCEPTED = 2; // DareState.Accepted

// POST /api/proofs/finalize {dareId, storagePath}: auth, doer only. Checks the uploaded file and
// returns its sha256 as the proofHash. The client then calls submitProof(dareId, proofHash).
export const POST = route(async (request: Request) => {
  const caller = await requireCaller(request);
  const body = finalizeProofSchema.parse(await readJson(request));
  await enforceRateLimit(`finalize:${caller.userId}`, 20, 3600, "Too many proof uploads.");

  const path = parseStoragePath(body.storagePath);
  if (!path || path.kind !== "proof") throw new ApiError(400, "storagePath must be a proof path from /api/upload-url.");

  const dare = await getDareOnchain(body.dareId);
  if (dare.state !== ACCEPTED) throw new ApiError(409, "This dare is not waiting for proof.");
  if (!ownsWallet(caller, dare.doer) || path.wallet !== dare.doer.toLowerCase()) {
    throw new ApiError(403, "Only the dare's doer can post proof, from the wallet that accepted it.");
  }
  if (BigInt(Math.floor(Date.now() / 1000)) > dare.proofDeadline) {
    throw new ApiError(409, "The proof deadline has passed.");
  }

  const rule = UPLOAD_RULES.proof;
  const { data: blob, error } = await db().storage.from(rule.bucket).download(body.storagePath);
  if (error || !blob) throw new ApiError(404, "Upload the file first, then finalize.");
  const mime = blob.type.split(";")[0];
  if (blob.size > rule.maxBytes) throw new ApiError(400, "Proof files must be 50 MB or smaller.");
  if (!rule.mimes[mime] || rule.mimes[mime] !== path.ext) {
    throw new ApiError(400, "Proof must be a JPEG, PNG, WebP, HEIC photo or an MP4, MOV, WebM clip.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!magicMatches(mime, bytes.subarray(0, 16))) throw new ApiError(400, `That file is not really ${mime}.`);

  const proofHash = proofHashOf(bytes);
  const existing = check(
    await db().from("proofs").select("dare_id").eq("proof_hash", proofHash).limit(1),
    "checking proof",
  ) as Array<{ dare_id: number }>;
  if (existing[0] && Number(existing[0].dare_id) !== Number(body.dareId)) {
    throw new ApiError(409, `This exact file was already used as proof for dare ${existing[0].dare_id}.`);
  }
  if (!existing[0]) {
    const { error: insertError } = await db().from("proofs").insert({
      proof_hash: proofHash,
      dare_id: body.dareId.toString(),
      uploader_wallet: dare.doer.toLowerCase(),
      storage_path: body.storagePath,
      mime,
      size_bytes: blob.size,
    });
    if (insertError) {
      console.error("[finalize] insert:", insertError.message);
      throw new ApiError(502, "Database error while saving the proof.");
    }
  }
  return ok({ proofHash, url: publicUrl(rule.bucket, body.storagePath), mime, sizeBytes: blob.size });
});
