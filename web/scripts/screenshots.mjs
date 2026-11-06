// Screenshots every 3c-2a screen and runs layout checks. Needs `npm run dev` (mock mode is dev-only).
//   node scripts/screenshots.mjs [baseUrl=http://localhost:3000] [outDir=../design/screens/3c2a]
// Optional: CHROME=/path/to/chrome to use an existing Chromium instead of Playwright's download.
//
// Checks per screen and viewport:
//   - no horizontal scroll (document wider than the viewport)
//   - the fixed bottom nav never covers content (scrolled to the end, main's last element ends
//     above the nav)
//   - no "robinhood" in visible text, title, meta tags, alt / aria-label / placeholder / title attributes
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? new URL("../../design/screens/3c2a/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const SCREENS = [
  // logged out (no mock): real onboarding entry
  { name: "01-o1-how-it-works", path: "/start" },
  { name: "02-o2-sign-in", path: "/start?step=signin" },
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
  { name: "13-crews", path: "/crews?mock=1", nav: true },
  { name: "14-crews-empty", path: "/crews?mock=empty", nav: true },
  { name: "15-group-feed", path: "/g/7?mock=1", nav: true },
  { name: "16-group-feed-empty", path: "/g/7?mock=empty", nav: true },
  { name: "17-new-placeholder", path: `/new?group=7&text=${encodeURIComponent("compliment a stranger's outfit")}&mock=1`, nav: true },
  { name: "18-wallet", path: "/wallet?mock=1", nav: true },
  { name: "19-profile", path: "/profile?mock=1", nav: true },
  { name: "20-tx-toast", path: "/g/7?mock=1", nav: true, clickText: "aight bet", afterClickMs: 400 },
];

const VIEWPORTS = [
  { tag: "mobile-390", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { tag: "desktop-1440", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
];

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const failures = [];
const files = [];

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  const page = await context.newPage();
  page.on("pageerror", (e) => failures.push(`${vp.tag} pageerror: ${e.message.split("\n")[0]}`));
  for (const sc of SCREENS) {
    await page.goto(base + sc.path, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    if (sc.clickText) {
      await page.getByRole("button", { name: sc.clickText }).first().click();
      await page.waitForTimeout(sc.afterClickMs ?? 300);
    }
    // Phones with the fixed bottom nav: a full-page capture would paint the nav mid-page, so take
    // the first screen and the scrolled-to-the-end screen (shows the nav clear of the last content).
    const phoneNav = vp.isMobile && sc.nav && !sc.clickText;
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
      await page.screenshot({ path: out + file, fullPage: !sc.clickText });
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
        return { hScroll, brand, covered, width: doc.scrollWidth };
      },
      { nav: !!sc.nav },
    );
    const problems = [];
    if (check.hScroll) problems.push(`horizontal scroll (${check.width}px)`);
    if (check.covered) problems.push("bottom nav covers content");
    if (check.brand) problems.push('"robinhood" found');
    console.log(`${problems.length ? "FAIL" : "ok  "}  ${vp.tag.padEnd(12)} ${sc.name}${problems.length ? `  -> ${problems.join(", ")}` : ""}`);
    if (problems.length) failures.push(`${vp.tag} ${sc.name}: ${problems.join(", ")}`);
  }
  await context.close();
}
await browser.close();
console.log(`\n${files.length} screenshots in ${out}`);
if (failures.length) {
  console.log(`\n${failures.length} problem(s):\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("ALL LAYOUT CHECKS PASSED");
