// Screenshots every app screen and runs layout checks. Needs `npm run dev` (mock mode is dev-only).
//   node scripts/screenshots.mjs [baseUrl=http://localhost:3000] [outDir=../design/screens/3c2a]
//   SET=3c2b2 node scripts/screenshots.mjs ...   only the screens tagged with that set
// Optional: CHROME=/path/to/chrome to use an existing Chromium instead of Playwright's download.
//
// Checks per screen and viewport:
//   - no horizontal scroll (document wider than the viewport)
//   - the fixed bottom nav never covers content (scrolled to the end, main's last element ends
//     above the nav)
//   - no "robinhood" in visible text, title, meta tags, alt / aria-label / placeholder / title attributes
//   - no visible text line is cut by the left or right viewport edge (text fully off-screen, like a
//     carousel's next card, is fine; text straddling the edge is not). Rows that scroll sideways on
//     purpose (stories, chip rows) are marked data-hscroll and fade out at the edge; they're skipped.
// The browser gets a fake camera/mic (--use-fake-device-for-media-stream) for the proof camera.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? new URL("../../design/screens/3c2a/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const SCREENS = [
  // logged out (no mock): real onboarding entry
  { name: "01-o1-how-it-works", path: "/start" },
  { name: "01b-o1-card-2", path: "/start", clickText: "next", clicks: 1, afterClickMs: 900, mobileOnly: true },
  { name: "01c-o1-card-3", path: "/start", clickText: "next", clicks: 2, afterClickMs: 900, mobileOnly: true },
  { name: "02-o2-sign-in", path: "/start?step=signin", set: "3c2b2" },
  // logged in via ?mock (dev-only fixtures)
  { name: "03-o3-you", path: "/start?step=you&mock=1" },
  { name: "04-o4-wallet-ready", path: "/start?step=wallet&mock=1" },
  { name: "05-o4b-switch-network", path: "/start?step=wallet&mock=external" },
  { name: "06-o5-your-crew", path: "/start?step=crew&mock=1" },
  { name: "07-o6-first-dare", path: "/start?step=first&group=7&mock=1" },
  { name: "08-invite-o1", path: "/i/k7m2p9xq4h?mock=1" },
  { name: "09-invite-o2-sign-in", path: "/i/k7m2p9xq4h?step=signin&mock=1" },
  { name: "10-invite-o4-wallet-join", path: "/i/k7m2p9xq4h?step=wallet&mock=1" },
  { name: "11-home", path: "/home?mock=1", nav: true },
  { name: "12-home-empty", path: "/home?mock=empty", nav: true },
  { name: "13-wifies", path: "/wifies?mock=1", nav: true, set: "3c2b2" },
  { name: "14-wifies-empty", path: "/wifies?mock=empty", nav: true },
  { name: "15-group-feed", path: "/g/7?mock=1", nav: true },
  { name: "16-group-feed-empty", path: "/g/7?mock=empty", nav: true },
  { name: "17-create-dare", path: `/new?group=7&text=${encodeURIComponent("compliment a stranger's outfit")}&mock=1`, nav: true },
  { name: "18-wallet", path: "/wallet?mock=1", nav: true, set: "3c2b2" },
  { name: "19-profile", path: "/profile?mock=1", nav: true, set: "3c2b2" },
  { name: "20-tx-toast", path: "/g/7?mock=1", nav: true, clickText: "aight bet", afterClickMs: 400 },
  // 3c-2b-1: dare detail in every state, the proof camera, and the review screen
  { name: "21-dare-open", path: "/d/41?mock=1", nav: true },
  { name: "22-dare-accepted-yours", path: "/d/38?mock=1", nav: true },
  { name: "23-dare-accepted-other", path: "/d/44?mock=1", nav: true },
  { name: "24-dare-voting", path: "/d/40?mock=1", nav: true },
  { name: "25-dare-passed", path: "/d/36?mock=1", nav: true },
  { name: "26-dare-failed", path: "/d/35?mock=1", nav: true },
  { name: "27-dare-expired", path: "/d/34?mock=1", nav: true },
  { name: "28-dare-cancelled", path: "/d/33?mock=1", nav: true },
  { name: "29-camera", path: "/d/38?mock=1", sequence: ["post proof"], afterClickMs: 1500, waitFor: "take photo (hold to record video)" },
  { name: "30-camera-review", path: "/d/38?mock=1", sequence: ["post proof", "take photo (hold to record video)"], afterClickMs: 2500 },
  // 3c-2b-2: wifies, score and streaks, share, invite, profile, 18+ gate
  { name: "31-wifie-leaderboard", path: "/g/7?mock=1", nav: true, clickText: "leaderboard", clickRole: "tab", afterClickMs: 900, set: "3c2b2" },
  { name: "32-profile-other", path: "/u/dayo?mock=1", nav: true, set: "3c2b2" },
  { name: "33-invite-sheet", path: "/g/7?mock=1", nav: true, clickText: "invite", afterClickMs: 700, set: "3c2b2" },
  { name: "34-share-sheet", path: "/d/36?mock=1", nav: true, clickText: "share this dare", afterClickMs: 500, waitText: "download image", noNativeShare: true, set: "3c2b2" },
  // a Saturday (UTC): the banner only shows Thu–Sun
  { name: "35-streak-at-risk", path: "/home?mock=1", nav: true, clock: "2026-11-07T12:00:00Z", set: "3c2b2" },
  { name: "36-result-score", path: "/d/45?mock=1", nav: true, waitText: "+125 score", set: "3c2b2" },
  { name: "37-age-modal", path: "/home?mock=1&age=0", viewportOnly: true, waitText: "confirm once", set: "3c2b2" },
  // last: marks this browser under 18 in localStorage (each viewport gets a fresh context)
  { name: "38-under-18", path: "/start?step=signin", clickText: "i'm under 18", afterClickMs: 700, waitText: "come back when", set: "3c2b2" },
];
const ONLY_SET = process.env.SET;

const VIEWPORTS = [
  { tag: "mobile-390", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { tag: "desktop-1440", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { tag: "laptop-1024", viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, only: ["01-o1-how-it-works", "08-invite-o1"] },
];

const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const failures = [];
// A fresh context per special screen: a fixed clock (Playwright's clock is per context, and a frozen
// clock stalls motion's entrance animations, so it must not leak into later screens), or no Web
// Share (headless share() never settles, so the fallback sheet is what we capture).
const open = async (vp, sc = {}) => {
  const context = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch, permissions: ["camera", "microphone"] });
  const p = await context.newPage();
  p.on("pageerror", (e) => failures.push(`${vp.tag} pageerror: ${e.message.split("\n")[0]}`));
  if (sc.clock) await p.clock.setFixedTime(new Date(sc.clock));
  if (sc.noNativeShare) await p.addInitScript(() => Object.defineProperty(navigator, "canShare", { value: undefined }));
  return p;
};
const files = [];

for (const vp of VIEWPORTS) {
  let page = await open(vp);
  for (const sc of SCREENS) {
    if (ONLY_SET && sc.set !== ONLY_SET) continue;
    if (vp.only && !vp.only.includes(sc.name)) continue;
    const fresh = sc.clock || sc.noNativeShare;
    if (fresh) {
      await page.context().close();
      page = await open(vp, sc);
    }
    if (sc.mobileOnly && !vp.isMobile) continue;
    await page.goto(base + sc.path, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    if (sc.clickText) {
      for (let i = 0; i < (sc.clicks ?? 1); i++) {
        await page.getByRole(sc.clickRole ?? "button", { name: sc.clickText }).first().click();
        await page.waitForTimeout(sc.afterClickMs ?? 300);
      }
    }
    for (const name of sc.sequence ?? []) {
      await page.getByRole("button", { name, exact: true }).first().click();
      await page.waitForTimeout(sc.afterClickMs ?? 300);
    }
    if (sc.waitFor) {
      // e.g. the shutter becomes enabled once the camera stream is live
      await page.waitForFunction((n) => [...document.querySelectorAll("button")].some((b) => b.getAttribute("aria-label") === n && !b.disabled), sc.waitFor, { timeout: 15000 });
      await page.waitForTimeout(600);
    }
    if (sc.waitText) {
      await page.getByText(sc.waitText, { exact: false }).first().waitFor({ state: "visible", timeout: 30000 });
      await page.waitForTimeout(1200); // let entrance animations finish
    }
    // Phones with the fixed bottom nav: a full-page capture would paint the nav mid-page, so take
    // the first screen and the scrolled-to-the-end screen (shows the nav clear of the last content).
    const phoneNav = vp.isMobile && sc.nav && !sc.clickText && !sc.sequence;
    if (phoneNav) {
      for (const [suffix, y] of [["top", 0], ["end", 1e6]]) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(250);
        const file = `${sc.name}--${vp.tag}-${suffix}.png`;
        await page.screenshot({ path: out + file });
        files.push(file);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
    } else {
      const file = `${sc.name}--${vp.tag}.png`;
      await page.screenshot({ path: out + file, fullPage: !sc.clickText && !sc.sequence && !sc.viewportOnly });
      files.push(file);
    }

    const check = await page.evaluate(
      ({ nav }) => {
        const doc = document.documentElement;
        const hScroll = doc.scrollWidth > window.innerWidth + 1;
        const attrs = [...document.querySelectorAll("[alt],[aria-label],[placeholder],[title],meta[content]")]
          .map((el) => ["alt", "aria-label", "placeholder", "title", "content"].map((a) => el.getAttribute(a) ?? "").join(" "))
          .join(" ");
        const brand = /robinhood/i.test(`${document.title} ${document.body.innerText} ${attrs}`);
        let covered = false;
        const navEl = document.querySelector("nav[aria-label=main].fixed");
        if (nav && navEl && getComputedStyle(navEl).display !== "none") {
          window.scrollTo(0, doc.scrollHeight);
          const main = document.querySelector("main");
          const last = main?.lastElementChild?.lastElementChild ?? main?.lastElementChild;
          const bottom = last?.getBoundingClientRect().bottom ?? 0;
          // the visible bar starts where the button row starts (gradient above is decorative)
          const navTop = navEl.querySelector("ul")?.getBoundingClientRect().top ?? navEl.getBoundingClientRect().top;
          covered = bottom > navTop + 1;
        }
        // Text cut by the viewport's left/right edge.
        const cut = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const W = window.innerWidth;
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent.trim()) continue;
          const el = n.parentElement;
          if (!el || el.closest("[aria-hidden=true], .sr-only, [data-hscroll]")) continue;
          const st = getComputedStyle(el);
          if (st.visibility === "hidden" || st.display === "none") continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const r of range.getClientRects()) {
            if (r.width < 1 || r.height < 1) continue;
            if ((r.left < -1 && r.right > 1) || (r.left < W - 1 && r.right > W + 1)) cut.push(n.textContent.trim().slice(0, 30));
          }
        }
        return { hScroll, brand, covered, cut: [...new Set(cut)], width: doc.scrollWidth };
      },
      { nav: !!sc.nav },
    );
    const problems = [];
    if (check.hScroll) problems.push(`horizontal scroll (${check.width}px)`);
    if (check.covered) problems.push("bottom nav covers content");
    if (check.brand) problems.push('"robinhood" found');
    if (check.cut.length) problems.push(`text cut at viewport edge: ${check.cut.map((t) => JSON.stringify(t)).join(", ")}`);
    console.log(`${problems.length ? "FAIL" : "ok  "}  ${vp.tag.padEnd(12)} ${sc.name}${problems.length ? `  -> ${problems.join(", ")}` : ""}`);
    if (problems.length) failures.push(`${vp.tag} ${sc.name}: ${problems.join(", ")}`);
    if (fresh) {
      await page.context().close();
      page = await open(vp);
    }
  }
  await page.context().close();
}
await browser.close();
console.log(`\n${files.length} screenshots in ${out}`);
if (failures.length) {
  console.log(`\n${failures.length} problem(s):\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("ALL LAYOUT CHECKS PASSED");
