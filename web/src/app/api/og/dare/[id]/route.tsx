import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { formatWif, handle, splitKeyPhrase } from "@/lib/format";
import { mockDare } from "@/lib/fixtures";
import type { DareView } from "@/lib/types";
import { crewAccess } from "@/server/access";
import { requireCaller } from "@/server/auth";
import { buildDareViews, proofsByHash } from "@/server/dareView";
import { ApiError, getRoute } from "@/server/http";
import { DARE_COLUMNS, profilesByWallet, type DareRow } from "@/server/queries";
import { check, db } from "@/server/supabase";
import { idSchema } from "@/server/validation";

const W = 1080;
const H = 1920;
const C = {
  bg: "#131317",
  surface: "#212126",
  border: "#3A3A41",
  text: "#F2F0E6",
  muted: "#9C9A92",
  lime: "#B8DA3C",
  violet: "#9077EA",
  ink: "#14141A",
};
const STAMP: Record<string, { fill: string; fg: string; label: string }> = {
  Passed: { fill: "#B8DA3C", fg: "#14141A", label: "PASSED" },
  Failed: { fill: "#421DBF", fg: "#F2F0E6", label: "FAILED" },
  Expired: { fill: "#55555D", fg: "#F2F0E6", label: "EXPIRED" },
  Voting: { fill: "#F2F0E6", fg: "#14141A", label: "VOTING" },
};

let fonts: Promise<Array<{ name: string; data: Buffer; weight: 400 | 800; style: "normal" }>> | null = null;
function loadFonts() {
  const dir = join(process.cwd(), "src/assets/fonts");
  fonts ??= Promise.all([readFile(join(dir, "ArchivoBlack-Regular.ttf")), readFile(join(dir, "BricolageGrotesque-ExtraBold.ttf"))]).then(([a, b]) => [
    { name: "Archivo Black", data: a, weight: 400 as const, style: "normal" as const },
    { name: "Bricolage", data: b, weight: 800 as const, style: "normal" as const },
  ]);
  return fonts;
}

/** Scalloped bottle-cap path (same shape as the app's ScallopBadge). */
function scallop(cx: number, cy: number, outer: number, inner: number, bumps: number) {
  const pts: string[] = [];
  for (let i = 0; i <= bumps * 2; i++) {
    const a = (i / (bumps * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? inner : outer;
    const x = (cx + r * Math.cos(a)).toFixed(1);
    const y = (cy + r * Math.sin(a)).toFixed(1);
    pts.push(i === 0 ? `M${x} ${y}` : i % 2 === 1 ? `Q${x} ${y}` : `${x} ${y}`);
  }
  return `${pts.join(" ")} Z`;
}

function Flame({ n }: { n: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface, border: `4px solid ${C.border}`, borderRadius: 999, padding: "6px 18px" }}>
      <svg width="34" height="40" viewBox="0 0 24 28">
        <path d="M12 1 C 14 7, 21 10, 20 18 C 19.5 24, 15.5 27, 12 27 C 8 27, 4 24, 4 18 C 4 13, 8 11, 9 6 C 11 9, 12 11, 12 14 C 14 12, 13.5 6, 12 1 Z" fill="#D9784F" />
        <path d="M12 15 C 14 18, 16 20, 15.5 23 C 15 25.5, 13.5 26.5, 12 26.5 C 10 26.5, 8.5 25, 8.7 22.5 C 9 20, 11 19, 12 15 Z" fill="#B8DA3C" />
      </svg>
      <span style={{ fontFamily: "Archivo Black", fontSize: 36, color: C.text }}>{n}</span>
    </div>
  );
}

/** The 1080x1920 share card. */
function Card({ d, media, avatar, appUrl }: { d: DareView; media: string | null; avatar: string | null; appUrl: string }) {
  const { key, rest } = splitKeyPhrase(d.text);
  const stamp = d.state === "Voting" ? STAMP.Voting : STAMP[d.outcome] ?? null;
  const doer = d.doer ?? d.target;
  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        padding: 48,
        backgroundColor: C.bg,
        backgroundImage: "radial-gradient(circle at center, rgba(242,240,230,0.07) 1.4px, transparent 2px)",
        backgroundSize: "36px 36px",
        color: C.text,
        fontFamily: "Bricolage",
      }}
    >
      {/* proof: top two thirds, rounded, receipt intact (contain keeps the burned-in strip visible) */}
      <div style={{ position: "relative", display: "flex", width: W - 96, height: 1180 }}>
        <div style={{ display: "flex", width: "100%", height: "100%", borderRadius: 56, border: `6px solid ${C.border}`, overflow: "hidden", backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
          {media ? (
            // eslint-disable-next-line @next/next/no-img-element -- next/og renders plain img
            <img src={media} width={W - 108} height={1168} style={{ objectFit: "contain" }} alt="" />
          ) : (
            <div style={{ display: "flex", fontFamily: "Archivo Black", fontSize: 72, color: C.muted }}>NO PROOF YET</div>
          )}
        </div>
        {stamp && (
          <div style={{ position: "absolute", right: -10, bottom: -70, width: 330, height: 330, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-8deg)" }}>
            <svg width="330" height="330" viewBox="0 0 220 220" style={{ position: "absolute", left: 0, top: 0 }}>
              <path d={scallop(110, 116, 98, 86, 21)} fill="#2B2B31" />
              <path d={scallop(110, 110, 98, 86, 21)} fill={stamp.fill} stroke={C.border} strokeWidth="7" />
            </svg>
            <span style={{ fontFamily: "Archivo Black", fontSize: 52, color: stamp.fg, marginTop: -6 }}>{stamp.label}</span>
          </div>
        )}
      </div>

      {/* dare text */}
      {/* one box per word so lines wrap naturally (next/og lays out flex items, not inline text) */}
      <div style={{ display: "flex", flexWrap: "wrap", marginTop: 70, fontSize: 64, lineHeight: 1.08, letterSpacing: -2, maxWidth: 940 }}>
        {[
          ...["bet", "you", "won't"].map((w) => ({ w, lime: false })),
          ...key.split(/\s+/).filter(Boolean).map((w) => ({ w, lime: true })),
          ...rest.trim().split(/\s+/).filter(Boolean).map((w) => ({ w, lime: false })),
        ].map((t, i) => (
          <span key={i} style={{ color: t.lime ? C.lime : C.text, marginRight: 16 }}>
            {t.w}
          </span>
        ))}
      </div>

      {/* doer + bounty */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 44 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", width: 104, height: 104, borderRadius: 999, padding: 6, backgroundColor: doer?.ringColor ?? C.border }}>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- next/og renders plain img
              <img src={avatar} width={92} height={92} style={{ borderRadius: 999, objectFit: "cover" }} alt="" />
            ) : (
              <div style={{ display: "flex", width: 92, height: 92, borderRadius: 999, backgroundColor: C.surface }} />
            )}
          </div>
          <span style={{ fontSize: 50 }}>{handle(doer)}</span>
          {(doer?.streak ?? 0) >= 2 && <Flame n={doer!.streak!} />}
        </div>
        <span style={{ fontFamily: "Archivo Black", fontSize: 60, color: C.violet }}>{formatWif(d.amount)} $wif</span>
      </div>

      {/* footer */}
      <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", alignItems: "flex-end", borderTop: `4px solid ${C.border}`, paddingTop: 30 }}>
        <span style={{ fontFamily: "Archivo Black", fontSize: 40, color: C.lime }}>BET YOU WON&apos;T · HOLD MY WIF</span>
        <span style={{ fontSize: 34, color: C.muted }}>{appUrl.replace(/^https?:\/\//, "")}</span>
      </div>
    </div>
  );
}

// small per-process cache: one PNG per dare state
const cache = new Map<string, ArrayBuffer>();
const CACHE_MAX = 60;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/**
 * Loads an image for the card as a data URI. Local paths ("/onboarding/x.png") are read from
 * public/; remote images are fetched ONLY from our Supabase storage host (no arbitrary URLs).
 */
async function imageData(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    if (url.startsWith("/")) {
      const clean = url.split("?")[0].replace(/\.\./g, "");
      const ext = clean.split(".").pop()?.toLowerCase() ?? "";
      if (!MIME_BY_EXT[ext]) return null;
      const buf = await readFile(join(process.cwd(), "public", clean));
      return `data:${MIME_BY_EXT[ext]};base64,${buf.toString("base64")}`;
    }
    const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://invalid").host;
    const u = new URL(url);
    if (u.protocol !== "https:" || u.host !== supabaseHost) return null;
    const res = await fetch(u, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

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
    d = buildDareViews({ dares: [row], viewer: caller.wallet.toLowerCase(), joinedAtByGroup: new Map(), voted: new Set(), profiles, proofs, readOnlyGroups: new Set([Number(row.group_id)]) })[0];
  }

  const key = `${dareId}:${d.state}:${d.outcome}:${d.proofUrl ?? "-"}:${d.doer?.streak ?? 0}:${d.doer?.avatarUrl ?? "-"}`;
  let png = cache.get(key);
  if (!png) {
    const isVideo = d.proofKind === "video" || d.proofMime?.startsWith("video/");
    const [media, avatar] = await Promise.all([imageData(isVideo ? d.posterUrl : d.proofUrl), imageData((d.doer ?? d.target)?.avatarUrl)]);
    const img = new ImageResponse(<Card d={d} media={media} avatar={avatar} appUrl={appUrl} />, { width: W, height: H, fonts: await loadFonts() });
    png = await img.arrayBuffer();
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, png);
  }
  return new Response(png, {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=60", "Content-Disposition": `inline; filename="byw-dare-${dareId}.png"` },
  });
});
