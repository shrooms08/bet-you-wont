// Camera capture helpers. Pure functions are unit-tested; drawReceipt only touches a canvas context.

/** "BYW · @juju · dare #12 · 6 Nov 2026, 14:03 · K7M2PQ" */
export function receiptText(o: { username: string | null; dareId: number; date: Date; code: string; locale?: string; timeZone?: string }): string {
  const when = new Intl.DateTimeFormat(o.locale ?? "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(o.timeZone ? { timeZone: o.timeZone } : {}),
  }).format(o.date);
  return `BYW · @${o.username ?? "anon"} · dare #${o.dareId} · ${when} · ${o.code}`;
}

/** First MediaRecorder type the browser supports: mp4 (Safari), then webm vp9, webm vp8, webm. */
export const RECORDER_TYPES = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"] as const;
export function pickRecorderMime(isSupported: (t: string) => boolean): string | null {
  return RECORDER_TYPES.find((t) => isSupported(t)) ?? null;
}

/** The upload/storage mime for a recorder type: "video/webm;codecs=vp9" -> "video/webm". */
export function baseMime(t: string): string {
  return t.split(";")[0].trim();
}

/** Scale (w,h) to fit inside max on the long side (never upscale). */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export const MAX_VIDEO_MS = 30_000;
export const PHOTO_MAX_SIDE = 1440;
export const VIDEO_MAX_SIDE = 1280;

/** Burns the receipt: a dark strip along the bottom with the text, plus a lime corner mark. */
export function drawReceipt(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  const strip = Math.max(28, Math.round(h * 0.055));
  const pad = Math.round(strip * 0.45);
  ctx.save();
  ctx.fillStyle = "rgba(19, 19, 23, 0.78)";
  ctx.fillRect(0, h - strip, w, strip);
  ctx.fillStyle = "#F2F0E6";
  let size = Math.round(strip * 0.46);
  ctx.font = `700 ${size}px "Bricolage Grotesque", system-ui, sans-serif`;
  while (ctx.measureText(text).width > w - pad * 3 && size > 9) {
    size -= 1;
    ctx.font = `700 ${size}px "Bricolage Grotesque", system-ui, sans-serif`;
  }
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad + strip * 0.5, h - strip / 2);
  // lime corner mark (top-left of the strip)
  ctx.fillStyle = "#B8DA3C";
  ctx.fillRect(pad * 0.6, h - strip + strip * 0.3, strip * 0.4, strip * 0.4);
  ctx.restore();
}
