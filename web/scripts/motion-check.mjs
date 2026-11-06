// 3c-2m motion checks.
//   node scripts/motion-check.mjs video [baseUrl=http://localhost:3000]   (needs `npm run dev` for /dev/motion)
//   node scripts/motion-check.mjs perf  [baseUrl=http://localhost:3001]   (use a production server: `next start`)
// video: records two short clips (< 10 s each) into ../design/screens/3c2m/
// perf:  O1 deck transition on a 390x844 touch viewport with 4x CPU throttling; logs every long
//        task (PerformanceObserver "longtask") and flags any over 50 ms.
// Optional: CHROME=/path/to/chrome to use an existing Chromium.
import { mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const mode = process.argv[2] ?? "video";
const base = process.argv[3] ?? (mode === "perf" ? "http://localhost:3001" : "http://localhost:3000");
const out = new URL("../../design/screens/3c2m/", import.meta.url).pathname;
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function record(name, contextOptions, script) {
  const tmp = mkdtempSync(join(tmpdir(), "byw-video-"));
  const context = await browser.newContext({ ...contextOptions, recordVideo: { dir: tmp, size: contextOptions.viewport } });
  const page = await context.newPage();
  const t0 = Date.now();
  await script(page);
  const seconds = (Date.now() - t0) / 1000;
  const video = page.video();
  await context.close();
  mkdirSync(out, { recursive: true });
  renameSync(await video.path(), join(out, name));
  rmSync(tmp, { recursive: true, force: true });
  console.log(`saved ${name} (${seconds.toFixed(1)} s)`);
}

if (mode === "video") {
  // Warm up both pages first (dev compiles on first visit) so recordings start on a loaded page.
  const warm = await browser.newContext();
  const wp = await warm.newPage();
  for (const path of ["/start?step=how", "/dev/motion"]) await wp.goto(base + path, { waitUntil: "networkidle" });
  await warm.close();
  await record("o1-deck--mobile-390.webm", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, async (page) => {
    await page.goto(`${base}/start?step=how`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "next" }).first().waitFor();
    await wait(900);
    await page.getByRole("button", { name: "next" }).first().click();
    await wait(1100);
    await page.getByRole("button", { name: "next" }).first().click();
    await wait(1300);
  });
  await record("motion-gallery--desktop-1440.webm", { viewport: { width: 1440, height: 900 } }, async (page) => {
    await page.goto(`${base}/dev/motion`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "hover me" }).waitFor();
    await wait(600);
    await page.mouse.move(300, 300);
    await page.mouse.move(700, 420, { steps: 10 });
    await page.getByRole("button", { name: "hover me" }).hover();
    await wait(300);
    await page.mouse.click(1250, 150);
    await wait(250);
    await page.mouse.click(1320, 210);
    await wait(300);
    await page.getByRole("button", { name: "passed", exact: true }).click();
    await wait(1300);
    await page.getByRole("button", { name: "failed", exact: true }).first().click();
    await wait(1100);
    await page.getByRole("button", { name: "+2,500" }).click();
    await page.getByRole("button", { name: "next status" }).click();
    await wait(500);
    await page.getByRole("button", { name: "done", exact: true }).click();
    await wait(1000);
  });
}

if (mode === "perf") {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__longtasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longtasks.push({ start: Math.round(e.startTime), ms: Math.round(e.duration) });
    }).observe({ type: "longtask", buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await page.goto(`${base}/start?step=how`, { waitUntil: "networkidle" });
  await wait(1500);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const mark = await page.evaluate(() => performance.now());
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "next" }).first().click();
    await wait(1500);
  }
  const tasks = await page.evaluate(() => window.__longtasks);
  const during = tasks.filter((t) => t.start >= mark);
  console.log(`long tasks during the O1 transitions (4x CPU throttle): ${during.length}`);
  for (const t of during) console.log(`  ${t.ms} ms at +${t.start - Math.round(mark)} ms${t.ms > 50 ? "  <-- over 50 ms" : ""}`);
  console.log(`page load long tasks (before throttling): ${tasks.filter((t) => t.start < mark).map((t) => t.ms + "ms").join(", ") || "none"}`);
  await context.close();
}
await browser.close();
