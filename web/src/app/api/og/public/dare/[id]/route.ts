import { buildDareViews, proofsByHash } from "@/server/dareView";
import { ApiError, getRoute } from "@/server/http";
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
  const found = await loadDareAndGroup(dareId);
  if (!found || !publicCardAllowed(found.group)) throw new ApiError(404, "No public dare with that number.");
  const { dare } = found;

  const [profiles, proofs] = await Promise.all([profilesByWallet([dare.creator_wallet, dare.target_wallet, dare.doer_wallet]), proofsByHash([dare.proof_hash])]);
  const d = buildDareViews({ dares: [dare], viewer: "", joinIndexByGroup: new Map(), voted: new Set(), profiles, proofs, readOnlyGroups: new Set([Number(dare.group_id)]) })[0];
  const png = await renderShareCard(d, process.env.NEXT_PUBLIC_APP_URL || url.origin);

  const current = url.searchParams.get("v") === cardVersion(dare);
  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": current ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=60, s-maxage=60",
      "Content-Disposition": `inline; filename="byw-dare-${dareId}.png"`,
    },
  });
});
