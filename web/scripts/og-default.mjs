// Renders public/og-default.png (1200x630): the generic link preview for every page and for
// private-wifie dares. Theme A colors, the dot texture, "BET YOU / WON'T." and "hold my wif".
//   node scripts/og-default.mjs        (CHROME=/path/to/chrome to use an existing Chromium)
// Needs network once for the Google Fonts the app uses (Archivo Black, Bricolage, Caveat Brush).
import { chromium } from "playwright";

const out = new URL("../public/og-default.png", import.meta.url).pathname;
const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Bricolage+Grotesque:wght@800&family=Caveat+Brush&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; background: #131317;
    background-image: radial-gradient(circle at center, rgb(242 240 230 / 0.10) 1.3px, transparent 2px);
    background-size: 26px 26px; font-family: "Bricolage Grotesque"; color: #F2F0E6; position: relative; }
  .glow { position: absolute; inset: 0; background: radial-gradient(circle at 18% 30%, rgb(184 218 60 / 0.10), transparent 45%),
    radial-gradient(circle at 88% 80%, rgb(144 119 234 / 0.14), transparent 45%); }
  .wrap { position: absolute; left: 84px; top: 70px; }
  h1 { font-family: "Archivo Black"; font-weight: 400; text-transform: uppercase; font-size: 168px; line-height: 0.86; letter-spacing: -0.035em; }
  h1 .l1 { color: #B8DA3C; display: block; }
  .pill { display: inline-block; margin-top: 46px; transform: rotate(-4deg); background: #B8DA3C; color: #14141A;
    border: 5px solid #14141A; border-radius: 999px; padding: 6px 44px 12px; font-family: "Caveat Brush"; font-size: 72px; line-height: 1;
    box-shadow: 0 9px 0 #14141A, 0 9px 0 5px rgb(242 240 230 / 0.12); }
  .stamp { position: absolute; right: 70px; top: 190px; width: 250px; height: 250px; transform: rotate(-12deg); }
  .stamp span { position: absolute; inset: 0; display: grid; place-items: center; font-family: "Archivo Black"; font-size: 40px; color: #14141A; letter-spacing: -0.02em; }
  .foot { position: absolute; right: 84px; bottom: 64px; font-size: 30px; font-weight: 800; color: #9C9A92; letter-spacing: -0.03em; }
</style></head><body>
<div class="glow"></div>
<div class="wrap"><h1><span class="l1">Bet you</span>won't.</h1><div class="pill">hold my wif</div></div>
<div class="stamp"><svg viewBox="0 0 300 300" width="250" height="250"><path id="s" fill="#B8DA3C" stroke="#14141A" stroke-width="6"/></svg><span>DARED</span></div>
<p class="foot">dare your friends · lock $wif · get paid</p>
<script>
  // scalloped bottle-cap stamp, same shape as the app's ScallopBadge
  const pts = []; const n = 22, cx = 150, cy = 150, R = 140, r = 124;
  for (let i = 0; i < n * 2; i++) { const a = (Math.PI * i) / n; const rad = i % 2 ? r : R; pts.push((i ? "L" : "M") + (cx + rad * Math.cos(a)).toFixed(1) + " " + (cy + rad * Math.sin(a)).toFixed(1)); }
  document.getElementById("s").setAttribute("d", pts.join(" ") + " Z");
</script></body></html>`;

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, type: "png" });
await browser.close();
console.log(`wrote ${out}`);
