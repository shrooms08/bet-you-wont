import { z } from "zod";
import { requireAdult } from "@/server/age";
import { ownsWallet, requireCaller } from "@/server/auth";
import { getDareOnchain } from "@/server/chain";
import { ApiError, ok, readJson, route } from "@/server/http";
import { newSessionCode, SESSION_TTL_MS } from "@/server/proofSession";
import { enforceRateLimit } from "@/server/rateLimit";
import { db } from "@/server/supabase";
import { idSchema } from "@/server/validation";

const ACCEPTED = 2;

// POST /api/proofs/session {dareId}: auth, onchain doer only, dare Accepted and before its proof
// deadline. Returns a 15-minute capture session whose code is burned into the photo/video.
export const POST = route(async (request: Request) => {
  const caller = await requireCaller(request);
  await requireAdult(caller);
  const body = z.object({ dareId: idSchema }).parse(await readJson(request));
  await enforceRateLimit(`proof-session:${caller.userId}`, 30, 3600, "Too many camera sessions.");

  const dare = await getDareOnchain(body.dareId);
  if (dare.state !== ACCEPTED) throw new ApiError(409, "This dare is not waiting for proof.");
  if (!ownsWallet(caller, dare.doer)) throw new ApiError(403, "Only the person who took the dare can post proof.");
  const now = Date.now();
  if (BigInt(Math.floor(now / 1000)) > dare.proofDeadline) throw new ApiError(409, "The proof deadline has passed.");

  const issuedAt = new Date(now);
  const expiresAt = new Date(now + SESSION_TTL_MS);
  const code = newSessionCode();
  const { data, error } = await db()
    .from("proof_sessions")
    .insert({
      dare_id: body.dareId.toString(),
      wallet_address: dare.doer.toLowerCase(),
      privy_user_id: caller.userId,
      code,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[proof-session]", error?.message);
    throw new ApiError(502, "Database error while starting the camera session.");
  }
  return ok({ sessionId: data.id, code, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString() });
});
