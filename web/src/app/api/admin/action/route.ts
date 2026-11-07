import { z } from "zod";
import { requireAdmin } from "@/server/admin";
import { requireCaller } from "@/server/auth";
import { dropSignedUrls } from "@/server/dareView";
import { deleteProofFiles, deleteUserData } from "@/server/deletion";
import { ApiError, ok, readJson, route } from "@/server/http";
import { check, db } from "@/server/supabase";
import { idSchema } from "@/server/validation";

const wallet = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((w) => w.toLowerCase());
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["hide_media", "unhide_media", "hide_text", "unhide_text", "delete_proof"]), dareId: idSchema }),
  z.object({ action: z.enum(["block_profile", "unblock_profile", "delete_profile"]), wallet }),
]);

// POST /api/admin/action: admins only. Hide/unhide a dare's media or text, delete its proof file for
// good, block/unblock a profile (no new dares, no public wifies, in the app), or delete a profile's
// data. Every action is written to admin_log.
export const POST = route(async (request: Request) => {
  const caller = await requireCaller(request);
  requireAdmin(caller);
  const body = bodySchema.parse(await readJson(request));
  const now = new Date().toISOString();
  let result: Record<string, unknown> = {};

  if ("dareId" in body) {
    const dareId = Number(body.dareId);
    const exists = (check(await db().from("dares").select("id").eq("id", dareId).limit(1), "loading dare") as unknown[]).length > 0;
    if (!exists) throw new ApiError(404, "No dare with that number.");
    const patch: Record<string, string | null> = {
      hide_media: { media_hidden_at: now, media_hidden_by: "admin" },
      unhide_media: { media_hidden_at: null, media_hidden_by: null, media_cleared_at: now },
      hide_text: { text_hidden_at: now, text_hidden_by: "admin" },
      unhide_text: { text_hidden_at: null, text_hidden_by: null, text_cleared_at: now },
      delete_proof: { media_hidden_at: now, media_hidden_by: "admin" },
    }[body.action];
    const { error } = await db().from("dares").update(patch).eq("id", dareId);
    if (error) throw new ApiError(502, "Database error while updating the dare.");
    if (body.action === "delete_proof") result = { filesDeleted: await deleteProofFiles(dareId) };
    if (body.action === "hide_media") {
      const paths = check(await db().from("proofs").select("storage_path, poster_path").eq("dare_id", dareId), "loading proof") as Array<{ storage_path: string | null; poster_path: string | null }>;
      dropSignedUrls(paths.flatMap((p) => [p.storage_path, p.poster_path]));
    }
  } else {
    const profile = (check(await db().from("profiles").select("privy_user_id").eq("wallet_address", body.wallet).limit(1), "loading profile") as Array<{ privy_user_id: string }>)[0];
    if (body.action === "delete_profile") {
      result = await deleteUserData({ privyUserId: profile?.privy_user_id ?? null, wallets: [body.wallet] });
    } else {
      if (!profile) throw new ApiError(404, "No profile with that wallet.");
      const { error } = await db().from("profiles").update({ blocked_at: body.action === "block_profile" ? now : null }).eq("wallet_address", body.wallet);
      if (error) throw new ApiError(502, "Database error while updating the profile.");
    }
  }

  await db().from("admin_log").insert({
    admin_wallet: caller.wallet.toLowerCase(),
    action: body.action,
    dare_id: "dareId" in body ? Number(body.dareId) : null,
    wallet: "wallet" in body ? body.wallet : null,
  });
  return ok({ done: body.action, ...result });
});
