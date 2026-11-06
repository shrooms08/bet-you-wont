import { requireCaller } from "@/server/auth";
import { isMemberOnchain } from "@/server/chain";
import { computeMetaHash, newSalt } from "@/server/hashing";
import { ApiError, ok, readJson, route } from "@/server/http";
import { isUnsafeDare, UNSAFE_DARE_MESSAGE } from "@/server/moderation";
import { enforceRateLimit } from "@/server/rateLimit";
import { db } from "@/server/supabase";
import { draftSchema } from "@/server/validation";

// POST /api/dares/draft {groupId, text}: auth, members only. Stores the dare text and returns the
// metaHash to pass to createDare. Sync later links the onchain dare back to this text by metaHash.
export const POST = route(async (request: Request) => {
  const caller = await requireCaller(request);
  const body = draftSchema.parse(await readJson(request));
  await enforceRateLimit(`draft:${caller.userId}`, 30, 3600, "Too many dare drafts.");

  if (isUnsafeDare(body.text)) throw new ApiError(400, UNSAFE_DARE_MESSAGE);
  if (!(await isMemberOnchain(body.groupId, caller.wallet))) {
    throw new ApiError(403, `This wallet is not a member of group ${body.groupId}.`);
  }

  const creator = caller.wallet;
  const salt = newSalt();
  const metaHash = computeMetaHash(body.groupId, creator, body.text, salt).toLowerCase();
  const { error } = await db().from("dare_drafts").insert({
    meta_hash: metaHash,
    group_id: body.groupId.toString(),
    creator_wallet: creator.toLowerCase(),
    text: body.text,
    salt,
  });
  if (error) {
    console.error("[draft] insert:", error.message);
    throw new ApiError(502, "Database error while saving the draft.");
  }
  return ok({ metaHash, groupId: body.groupId.toString(), creator, text: body.text });
});
