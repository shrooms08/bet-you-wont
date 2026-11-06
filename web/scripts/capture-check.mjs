// Proof capture pipeline check (dev server + fake camera). Takes one photo and one ~3 s video in
// the real ProofCamera (mock dare 38), then inspects the blobs: type, magic bytes, dimensions,
// video duration and poster. With --upload, also PUTs both files to the real "proofs" bucket via
// signed URLs (secret key from the environment) to prove the bucket accepts them, checks a PNG is
// rejected, and deletes the test objects.
//   node scripts/capture-check.mjs [baseUrl] [--upload] [--webm]
// --webm makes MediaRecorder report MP4 as unsupported, to exercise the WebM path (Firefox/older Chrome).
import { chromium } from "playwright";

const base = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const upload = process.argv.includes("--upload");
const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["camera", "microphone"] });
const page = await ctx.newPage();
if (process.argv.includes("--webm")) {
  await page.addInitScript(() => {
    const orig = MediaRecorder.isTypeSupported.bind(MediaRecorder);
    MediaRecorder.isTypeSupported = (t) => !t.startsWith("video/mp4") && orig(t);
  });
}
const shutter = (name) => page.waitForFunction((n) => [...document.querySelectorAll("button")].some((b) => b.getAttribute("aria-label") === n && !b.disabled), name, { timeout: 20000 });

async function inspect(label) {
  return page.evaluate(async (label) => {
    const c = window.__bywLastCapture;
    const buf = new Uint8Array(await (await fetch(c.url)).arrayBuffer());
    const hex = [...buf.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const out = { label, kind: c.kind, mime: c.mime, bytes: buf.length, magic: hex };
    if (c.kind === "photo") {
      const img = new Image();
      img.src = c.url;
      await img.decode();
      Object.assign(out, { width: img.naturalWidth, height: img.naturalHeight });
      // receipt strip: the bottom rows are much darker than the fake camera's green frame
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const g = cv.getContext("2d");
      g.drawImage(img, 0, 0);
      // strip = bottom ~5.5% of the frame; sample the row through the middle of the receipt text
      const stripH = Math.max(28, Math.round(cv.height * 0.055));
      const y = cv.height - Math.round(stripH / 2);
      const d = g.getImageData(0, y, cv.width, 1).data;
      const lums = [];
      for (let i = 0; i < d.length; i += 4) lums.push((d[i] + d[i + 1] + d[i + 2]) / 3);
      const sorted = [...lums].sort((a, b) => a - b);
      // the lime corner mark sits at the left end of the strip
      const mark = g.getImageData(0, cv.height - stripH, Math.round(stripH * 1.2), stripH).data;
      let lime = 0;
      for (let i = 0; i < mark.length; i += 4) if (mark[i] > 150 && mark[i + 1] > 180 && mark[i + 2] < 120) lime++;
      Object.assign(out, { stripMedian: Math.round(sorted[Math.floor(sorted.length / 2)]), stripMax: Math.round(sorted[sorted.length - 1]), limeMarkPixels: lime });
    } else {
      const v = document.createElement("video");
      v.src = c.url;
      v.muted = true;
      await new Promise((r) => (v.onloadedmetadata = r));
      // MediaRecorder webm often reports Infinity until seeked to the end
      if (!isFinite(v.duration)) { v.currentTime = 1e6; await new Promise((r) => (v.ontimeupdate = r)); }
      Object.assign(out, { width: v.videoWidth, height: v.videoHeight, durationS: Math.round(v.duration * 10) / 10, recorderMs: Math.round(c.durationMs), posterBytes: c.posterSize });
      if (c.posterUrl) {
        const p = new Uint8Array(await (await fetch(c.posterUrl)).arrayBuffer());
        out.posterMagic = [...p.slice(0, 3)].map((b) => b.toString(16)).join(" ");
      }
    }
    return out;
  }, label);
}

async function blobBytes() {
  return page.evaluate(async () => {
    const c = window.__bywLastCapture;
    const b = new Uint8Array(await (await fetch(c.url)).arrayBuffer());
    return { mime: c.mime, data: Array.from(b) };
  });
}

await page.goto(`${base}/d/38?mock=1`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "post proof", exact: true }).click();
await shutter("take photo (hold to record video)");
await page.waitForTimeout(800);
await page.getByRole("button", { name: "take photo (hold to record video)" }).click();
await page.waitForFunction(() => window.__bywLastCapture?.kind === "photo", null, { timeout: 15000 });
const photo = await inspect("photo");
const photoBytes = upload ? await blobBytes() : null;
console.log(JSON.stringify(photo));

await page.getByRole("button", { name: "retake" }).click();
await page.getByRole("radio", { name: "video" }).click();
await shutter("start recording");
await page.getByRole("button", { name: "start recording" }).click();
await page.waitForTimeout(3000);
await page.getByRole("button", { name: "stop recording" }).click();
await page.waitForFunction(() => window.__bywLastCapture?.kind === "video", null, { timeout: 15000 });
await page.waitForTimeout(500);
const video = await inspect("video");
const videoBytes = upload ? await blobBytes() : null;
console.log(JSON.stringify(video));
await browser.close();

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };
check(photo.mime === "image/jpeg" && photo.magic.startsWith("ff d8 ff"), "photo is a real JPEG");
check(Math.max(photo.width, photo.height) <= 1440, `photo long side <= 1440 (${photo.width}x${photo.height})`);
check(
  photo.stripMedian < 60 && photo.stripMax > 180 && photo.limeMarkPixels > 20,
  `receipt burned into the photo: dark strip (median ${photo.stripMedian}), cream text (max ${photo.stripMax}), lime mark (${photo.limeMarkPixels} px)`,
);
check(["video/webm", "video/mp4"].includes(video.mime), `video type ${video.mime}`);
check(video.mime === "video/webm" ? video.magic.startsWith("1a 45 df a3") : video.magic.slice(12, 23) === "66 74 79 70", "video magic bytes match its type");
check(video.durationS >= 2.5 && video.durationS <= 4, `video ~3 s (${video.durationS}s; recorder ${video.recorderMs} ms)`);
check(video.width > 0 && Math.max(video.width, video.height) <= 1280, `video frames <= 1280 (${video.width}x${video.height})`);
check(video.posterBytes > 0 && video.posterMagic === "ff d8 ff", "video has a JPEG poster");

if (upload) {
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const put = async (bytes, mime, ext) => {
    const path = `proof/0x0000000000000000000000000000000000000001/${crypto.randomUUID()}.${ext}`;
    const { data } = await db.storage.from("proofs").createSignedUploadUrl(path);
    const res = await fetch(data.signedUrl, { method: "PUT", headers: { "content-type": mime, "x-upsert": "false" }, body: new Uint8Array(bytes) });
    return { path, status: res.status };
  };
  const p = await put(photoBytes.data, "image/jpeg", "jpg");
  const v = await put(videoBytes.data, videoBytes.mime, videoBytes.mime === "video/mp4" ? "mp4" : "webm");
  const png = await put([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0], "image/png", "jpg");
  check(p.status === 200, `bucket accepts the captured photo (${p.status})`);
  check(v.status === 200, `bucket accepts the captured video (${v.status})`);
  check(png.status >= 400, `bucket rejects a PNG (${png.status})`);
  await db.storage.from("proofs").remove([p.path, v.path, png.path]);
  console.log("removed test objects");
}
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CAPTURE CHECKS PASSED");
process.exit(failures ? 1 : 0);
