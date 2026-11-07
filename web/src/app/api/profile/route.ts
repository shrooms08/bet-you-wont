import { RING_COLORS } from "@/lib/theme";
import { requireCaller } from "@/server/auth";
import { ApiError, ok, readJson, route } from "@/server/http";
import { magicMatches, parseStoragePath, UPLOAD_RULES } from "@/server/media";
import type { ProfileRow } from "@/server/queries";
import { enforceRateLimit } from "@/server/rateLimit";
import { check, db, publicUrl } from "@/server/supabase";
import { profileSchema } from "@/server/validation";
import { profileAgeDecision } from "@/server/visibility";

/** Confirms an uploaded avatar is ours, exists, and really is the image type it claims. */
async function verifyAvatar(path: string, wallet: string): Promise<string> {
  const parsed = parseStoragePath(path);
  if (!parsed || parsed.kind !== "avatar" || parsed.wallet !== wallet) {
    throw new ApiError(400, "avatarPath must be an avatar path issued to this wallet by /api/upload-url.");
  }
  const rule = UPLOAD_RULES.avatar;
  const { data: blob, error } = await db().storage.from(rule.bucket).download(path);
  if (error || !blob) throw new ApiError(400, "Upload the avatar first, then save your profile.");
  const mime = blob.type.split(";")[0];
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (blob.size > rule.maxBytes || !rule.mimes[mime] || rule.mimes[mime] !== parsed.ext || !magicMatches(mime, head)) {
    throw new ApiError(400, "That avatar isn't a valid JPEG, PNG or WebP under 5 MB.");
  }
  return publicUrl(rule.bucket, path);
}

// POST /api/profile {username, avatarPath?}: auth. Creates or updates this Privy user's profile.
export const POST = route(async (request: Request) => {
  const caller = await requireCaller(request);
  const body = profileSchema.parse(await readJson(request));
  await enforceRateLimit(`profile:${caller.userId}`, 20, 3600, "Too many profile updates.");
  const wallet = caller.wallet.toLowerCase();

  const avatarUrl = body.avatarPath ? await verifyAvatar(body.avatarPath, wallet) : undefined;
  const existing = check(
    await db().from("profiles").select("*").eq("privy_user_id", caller.userId).limit(1),
    "loading profile",
  ) as ProfileRow[];
  const ringColor = existing[0]?.ring_color ?? RING_COLORS[Math.floor(Math.random() * RING_COLORS.length)];
  // 18+: creating a profile needs ageConfirmed; an existing unconfirmed profile confirms here
  const age = profileAgeDecision(existing[0] ? { age_confirmed_at: existing[0].age_confirmed_at ?? null } : null, body.ageConfirmed);
  if (!age.ok) throw new ApiError(403, "confirm you're 18+");

  const { data, error } = await db()
    .from("profiles")
    .upsert(
      {
        privy_user_id: caller.userId,
        wallet_address: wallet,
        username: body.username,
        ring_color: ringColor,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        ...(age.setAge ? { age_confirmed_at: new Date().toISOString() } : {}),
      },
      { onConflict: "privy_user_id" },
    )
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505" && error.message.includes("username")) throw new ApiError(409, `@${body.username} is taken.`);
    if (error.code === "23505") throw new ApiError(409, "This wallet already belongs to another profile.");
    console.error("[profile] upsert:", error.message);
    throw new ApiError(502, "Database error while saving your profile.");
  }
  const p = data as ProfileRow;
  return ok({ profile: { wallet: p.wallet_address, username: p.username, avatarUrl: p.avatar_url, ringColor: p.ring_color, ageConfirmed: !!p.age_confirmed_at } });
});
