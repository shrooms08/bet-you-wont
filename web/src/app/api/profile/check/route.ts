import { clientIp, ok, getRoute } from "@/server/http";
import { enforceRateLimit } from "@/server/rateLimit";
import { check, db } from "@/server/supabase";
import { usernameSchema } from "@/server/validation";

// GET /api/profile/check?username=: public, rate limited per IP. Is this @name free?
export const GET = getRoute(async (request: Request) => {
  await enforceRateLimit(`username-check:${clientIp(request)}`, 30, 60, "Too many username checks.");
  const raw = new URL(request.url).searchParams.get("username") ?? "";
  const parsed = usernameSchema.safeParse(raw);
  if (!parsed.success) {
    return ok({ username: raw, valid: false, available: false, reason: parsed.error.issues[0]?.message });
  }
  const username = parsed.data;
  const rows = check(await db().from("profiles").select("privy_user_id").eq("username", username).limit(1), "checking username");
  return ok({ username, valid: true, available: (rows ?? []).length === 0 });
});
