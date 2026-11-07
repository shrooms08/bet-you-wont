import { mockDare } from "@/lib/fixtures";
import type { DareView } from "@/lib/types";
import { crewAccess } from "@/server/access";
import { requireCaller } from "@/server/auth";
import { buildDareViews, proofsByHash } from "@/server/dareView";
import { ApiError, getRoute } from "@/server/http";
import { DARE_COLUMNS, profilesByWallet, type DareRow } from "@/server/queries";
import { renderShareCard } from "@/server/shareCard";
import { check, db } from "@/server/supabase";
import { idSchema } from "@/server/validation";

// GET /api/og/dare/<id>: auth + the same visibility rules as the dare page. 1080x1920 PNG.
// Development only: ?mock=1 renders the mock fixture for that id (no auth), for screenshots.
export const GET = getRoute(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const url = new URL(request.url);
  const dareId = Number(idSchema.parse((await ctx.params).id));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;

  let d: DareView;
  if (process.env.NODE_ENV !== "production" && url.searchParams.get("mock")) {
    d = mockDare(dareId).dare;
  } else {
    const caller = await requireCaller(request);
    const row = (check(await db().from("dares").select(DARE_COLUMNS).eq("id", dareId).limit(1), "loading dare") as unknown as DareRow[])[0];
    if (!row) throw new ApiError(404, "No dare with that number.");
    const access = await crewAccess(Number(row.group_id), caller.wallet);
    if (!access.canSee) throw new ApiError(404, "this dare is private");
    const [profiles, proofs] = await Promise.all([profilesByWallet([row.creator_wallet, row.target_wallet, row.doer_wallet]), proofsByHash([row.proof_hash])]);
    d = buildDareViews({ dares: [row], viewer: caller.wallet.toLowerCase(), joinIndexByGroup: new Map(), voted: new Set(), profiles, proofs, readOnlyGroups: new Set([Number(row.group_id)]) })[0];
  }

  const png = await renderShareCard(d, appUrl);
  return new Response(png, {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=60", "Content-Disposition": `inline; filename="byw-dare-${dareId}.png"` },
  });
});
