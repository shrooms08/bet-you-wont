import { buildDareViews, proofsForDares } from "@/server/dareView";
import { ApiError, clientIp, getRoute } from "@/server/http";
import { enforceRateLimit } from "@/server/rateLimit";
import { cardVersion, publicCardAllowed } from "@/server/linkPreview";
import { loadDareAndGroup } from "@/server/previewData";
import { profilesByWallet } from "@/server/queries";
import { renderShareCard } from "@/server/shareCard";
import { idSchema } from "@/server/validation";

// GET /api/og/public/dare/<id>[?v=<version>]: no auth. The same 1080x1920 share card, but ONLY for
// dares in a public wifie (404 otherwise, the same answer as a missing dare). Used as og:image for
// link previews. With ?v= matching the dare's current state the PNG is cached for a day at the
// edge (the version changes with the state); without it, for a minute.
export const GET = getRoute(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const url = new URL(request.url);
  const dareId = Number(idSchema.parse((await ctx.params).id));
  await enforceRateLimit(`og-public:${clientIp(request)}`, 60, 60, "Too many share cards."); // L-5
  const found = await loadDareAndGroup(dareId);
  if (!found || !publicCardAllowed(found.group)) throw new ApiError(404, "No public dare with that number.");
  const { dare } = found;

  // L-5: one cache key per dare state. Any other ?v= (or extra params) redirects to the canonical
  // URL, so random query strings can't force fresh renders past the edge cache.
  const version = cardVersion(dare);
  const v = url.searchParams.get("v");
  if ((v !== null && v !== version) || [...url.searchParams.keys()].some((k) => k !== "v")) {
    return Response.redirect(new URL(`/api/og/public/dare/${dareId}?v=${encodeURIComponent(version)}`, url.origin), 302);
  }

  const [profiles, proofs] = await Promise.all([profilesByWallet([dare.creator_wallet, dare.target_wallet, dare.doer_wallet]), proofsForDares([dare])]);
  const d = buildDareViews({ dares: [dare], viewer: "", joinIndexByGroup: new Map(), voted: new Set(), profiles, proofs, readOnlyGroups: new Set([Number(dare.group_id)]) })[0];
  const png = await renderShareCard(d, process.env.NEXT_PUBLIC_APP_URL || url.origin);

  const current = v === version;
  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": current ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=60, s-maxage=60",
      "Content-Disposition": `inline; filename="byw-dare-${dareId}.png"`,
    },
  });
});
