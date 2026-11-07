import { z } from "zod";
import { requireAdult } from "@/server/age";
import { requireCaller } from "@/server/auth";
import { crewAccess } from "@/server/access";
import { ApiError, ok, readJson, route } from "@/server/http";
import { enforceRateLimit } from "@/server/rateLimit";
import { toggleReaction } from "@/server/reactions";
import { check, db } from "@/server/supabase";
import { idSchema } from "@/server/validation";

// POST /api/reactions {dareId}: auth, 120/h. Toggles the caller's 🔥 on a dare they can see
// (member of its crew, or the crew is public). Returns {reacted, count}.
export const POST = route(async (request: Request) => {
  const caller = await requireCaller(request);
  await requireAdult(caller);
  const body = z.object({ dareId: idSchema }).parse(await readJson(request));
  await enforceRateLimit(`reactions:${caller.userId}`, 120, 3600, "Easy on the 🔥.");
  const dareId = body.dareId.toString();

  const dare = (check(await db().from("dares").select("group_id").eq("id", dareId).limit(1), "loading dare") as Array<{ group_id: number }>)[0];
  if (!dare) throw new ApiError(404, "No dare with that number.");
  const access = await crewAccess(Number(dare.group_id), caller.wallet);
  if (!access.canSee) throw new ApiError(404, "this dare is private");

  const result = await toggleReaction(
    {
      remove: async (d, w) => {
        const { data, error } = await db().from("reactions").delete().eq("dare_id", d).eq("wallet_address", w).select("dare_id");
        if (error) throw new ApiError(502, "Database error while reacting.");
        return (data ?? []).length > 0;
      },
      insert: async (d, w) => {
        const { error } = await db().from("reactions").upsert({ dare_id: d, wallet_address: w }, { onConflict: "dare_id,wallet_address" });
        if (error) throw new ApiError(502, "Database error while reacting.");
      },
      count: async (d) => {
        const { count, error } = await db().from("reactions").select("*", { count: "exact", head: true }).eq("dare_id", d);
        if (error) throw new ApiError(502, "Database error while reacting.");
        return count ?? 0;
      },
    },
    dareId,
    caller.wallet,
  );
  return ok(result);
});
