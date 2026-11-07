# BYW Phase 3c-2m: motion and dot texture

Built on 2026-11-06 with `motion` 14.10 (imported from `motion/react`). **Testnet only. No contract or API changes.** Commit: `e6e8b3d` Phase 3c-2m: motion and dot texture.

Secrets checks before the commit:
- No `.env*` file was staged.
- All 8 secret values were scanned against the staged diff: 0 matches.
- Production client bundle: 0 secret values.

## Presets (`web/src/lib/motion.ts`)

| Preset | Value | Used for |
|---|---|---|
| `springs.snappy` | stiffness 500, damping 32 | button press/hover, dots, tag flip, small pops |
| `springs.smooth` | stiffness 260, damping 30 | cards, deck, page entrance, nav pill, vote bar, toast |
| `springs.bouncy` | stiffness 400, damping 18 | stamp landing, O3 tick/cross, toast success check |
| `durations` | fast 0.15, base 0.25, countUp 0.3, slow 0.45 s | |
| `STAGGER` | 0.04 s | list entrances (the 3 big O1 desktop cards use 0.08 s) |
| `REDUCED` / `pick()` | 0.15 s linear tween | what a spring becomes under reduced motion |
| `fxEnabled()` | `{ pixelCursor, spotlight, particles, springs }` | turns the decorative layers on or off |

**Animation rule.** Only `transform` and `opacity` animate, plus the `--mx`/`--my` CSS variables for the spotlight. Two places needed care:
- **Vote bar fill:** springs `scaleX` from the left edge rather than `width`.
- **Button press:** the 6px → 2px lip swap is an instant CSS change, not an animation; only the 4px drop is a spring.

## What animates where

**Texture and effects** (`web/src/components/fx/FxLayer.tsx`, mounted once in the root layout):
- **Dot texture:**
  - The page background has 1px dots on an 18px grid, cream at 6%.
  - Raised cards have the same grid at 3%. I put it in the card's own `background-image` instead of a pseudo-element. It looks the same, never paints over the content, and needs no z-index or `pointer-events` handling.
- **Spotlight** (fine pointer only):
  - A second dot layer at 18% opacity sits behind the content.
  - It's masked by a 160px radial gradient centered on `--mx`/`--my`, which are updated on `pointermove` and written once per animation frame.
  - The page dots moved from `<body>` to `<html>` so this layer can sit between the page background and the content.
- **Pixel cursor** (fine pointer only):
  - A 20×28px arrow built from 2px squares: lime `#B8DA3C`, with a dark `#14141A` 2px outline. It follows the pointer with `translate3d`, updated once per animation frame.
  - Over buttons and links it tilts 8° and scales to 1.1.
  - Over text inputs, textareas and contenteditable it hides and the native caret shows. It also hides when the pointer leaves the window.
- **Click and tap burst** (all devices, at the tap point):
  - 8–12 glyphs (× + ○ □ ≡ #, monospace, 10–12px) in lime, violet, cream, cyan and magenta.
  - Each flies 20–60px outward with slight gravity, rotates, and fades out over 450–650 ms.
  - Rendering:
    - One devicePixelRatio-aware canvas (`pointer-events: none`).
    - A pool of 60 pre-made particles; when it's full the oldest is reused, so nothing is allocated per frame.
    - The animation-frame loop runs only while particles are alive.

**O1 "how it works":**
- **Mobile deck** (`web/src/components/onboarding/HowItWorks.tsx`):
  - On "next" or a swipe left, the current card animates to scale 0.86, −3°, x −60%, opacity 0. The next card comes in from 0.86, 3°, x 60%, opacity 0. Both use the smooth spring at the same time; "back" reverses.
  - `drag="x"` uses an offset-plus-velocity threshold and rubber-bands at both ends. Only the button leaves the deck on the last card.
  - The sticker trails its card by about 8%, both through the transition variants and during a drag.
  - The active dot's width changes with a `layout` animation.
- **Tablet and desktop row:** cards rise in staggered (y 24 → 0, fade in). On hover they lift 6px and tilt toward the cursor, up to 4°.
- **Stickers:** every onboarding sticker floats (y ±4px, ±1°) on a 4–6 s loop with a different phase each.

**Existing screens:**
- **Route entrance:** content fades in and rises 12px. This applies to the main column and side column of logged-in screens and to each onboarding step. There's no exit animation.
- **Headline:** each line slides up from behind a mask, 0.08 s apart.
- **Staggered lists:** home "waiting on you", home crews, `/crews`, feed dares, and O5 and O6 options.
- **PillButton / PillLink:** lift 2px on hover (mouse only); the press drop uses the snappy spring.
- **BottomNav and DesktopRail:** the lime active background is a shared `layoutId` pill that glides between items. To make that work across pages, the logged-in pages moved into an `app/(app)` route group whose layout renders the nav once. URLs are unchanged.
- **Money:** counts from the old value to the new one in 300 ms. There's no animation on first render.
- **Vote tally bar:** the fill springs when the counts change.
- **StatusTag:** flips (rotateX) to the new status when it changes; no flip on mount.
- **TxToast:**
  - It now springs up from the bottom, sitting above the bottom nav on phones and tablets, and 24px from the bottom on desktop.
  - On success the check pops and draws itself in; on failure the toast shakes once.
- **Skeleton:** a band of brighter dots sweeps across (transform only), replacing the plain pulse.
- **O3 @name check:** the tick or cross pops in with the bouncy spring.

**New components for 3c-2b** (`web/src/components/motion/`):
- **`<StampSlam outcome>`:**
  - The scallop badge drops from scale 2.2 and −12° to scale 1 with the bouncy spring.
  - On impact (about 170 ms in) the page shakes for two frames, 4px.
  - 30–40 round confetti dots in theme colors burst from the badge, with gravity, gone by 1.2 s.
- **`<DoubleTapBurst onReact>`:**
  - Wraps media. A double tap or double click shows a big 🔥 (scale 0.4 → 1.2 → 1, then it floats up and fades), plus 6 small 🔥 particles.
  - It works the same for mouse and touch, and `touch-action: manipulation` stops double-tap zoom.
  - It calls `onReact`.
- **`/dev/motion`** (development only, 404 in production; verified): demos the cursor, spotlight, burst, O1 deck, stamp (all three outcomes), double tap, toast states, count-up, tag flip, vote bar, nav pill glide, headline/list replay and skeleton.

## Reduced-motion behavior

Under `prefers-reduced-motion`:
- `MotionConfig reducedMotion="user"` turns off every transform and layout animation app-wide. Opacity fades remain.
- `fxEnabled()` turns off the pixel cursor, the spotlight and all particles.
- StampSlam becomes a plain fade with no shake or confetti.
- Money jumps straight to the new number.
- The existing CSS rule cuts CSS animations (shimmer, spinners) to near zero.

Verified in a browser emulating reduced motion:
- the pixel cursor class, cursor element and spotlight are all absent
- clicking draws nothing on the particle canvas

With motion allowed, all three are present and a burst is drawn. A unit test also checks the switch: reduced motion turns everything off; a touch device still gets particles but no cursor or spotlight.

## Tests and checks

- **`npm test`:** 88/88 pass. New since 3c-2a:
  - The particle pool never exceeds 60 live particles however many are spawned.
  - It reuses the oldest particle when full.
  - It never allocates new particle objects.
  - Bursts, confetti and emoji counts are within spec.
  - The reduced-motion switch, `pick()` and the exact preset values.
- **Build, lint, types:** `npm run build` passes; `npm run lint` and `tsc --noEmit` are clean.
- **Layout checks:** `node scripts/screenshots.mjs` passes on all 53 screenshots: no horizontal scroll, the nav never covers content, no text cut at a viewport edge, and the brand naming check passes. The 3c-2a screenshots were refreshed to show the texture.
- **Page-entrance wrapper:** settles to `transform: none` and `will-change: auto`. This matters because a leftover transform would break fixed elements inside the page, such as the toast and the proof sheet.

## Performance findings

Method:
- `node scripts/motion-check.mjs perf` runs against a production build.
- It loads `/start?step=how` at 390×844 on a touch device, throttles the CPU 4× (standing in for a mid-range phone), presses "next" twice, and logs every long task (`PerformanceObserver`, type `longtask`).

| Run | Before fixes | After fixes |
|---|---|---|
| Long tasks over 50 ms during the two transitions | 1 per run: 67, 71, 90 ms | 1 per run: 60, 64, 69, 77 ms |
| Second transition | none | none |
| Page load (unthrottled) | 72–81 ms | 71–82 ms |

What I found:
1. **Particle glyphs:** the first glyph draw on the overlay canvas cost 70–125 ms on the first tap. That's font-fallback lookup for glyphs like ○ □ ≡, plus first use of the full-screen canvas.
   - **Fix:** while the browser is idle after load, draw every glyph once almost invisibly on the real canvas, then clear it.
   - **Result:** a tap on empty space now produces no long task.
2. **Deck card mounting:** the deck used to mount the incoming card mid-transition.
   - **Fix:** it now keeps all three cards mounted. Parked cards are hidden (`visibility: hidden`, `inert`), and the deck clips sideways at the screen edges.
   - **Result:** "next" only changes animation targets.
3. **What remains:** a single 60–77 ms task on the first button press only.
   - A Chrome trace splits it into handling the click (mostly React's state update) and the first animation frame (motion starting the card, sticker, dot and button springs, plus repainting the textured cards).
   - Triggering "next" from the keyboard shows no long task.
   - The second transition has none either.
   - So it's first-run warm-up of these code paths. It costs roughly 15–20 ms of real CPU time on this machine, but drops about 4 frames once on a phone-class CPU. I stopped there rather than restructure further; the concerns list how to go after it.

## Videos (`design/screens/3c2m/`)

Recorded with Playwright `recordVideo`. The pages are warmed up first so the clips start on a loaded page. No temporary recordings were left behind.

| File | Length | What |
|---|---|---|
| `o1-deck--mobile-390.webm` | 3.7 s | `/start?step=how` at 390×844 (touch): "next" twice, through all three cards to "let's go" |
| `motion-gallery--desktop-1440.webm` | 6.9 s | `/dev/motion` at 1440×900: pixel cursor and spotlight, button hover tilt, two click bursts, PASSED then FAILED stamps with confetti, count-up, tag flip, success toast |

I checked frames from both clips: the deck transition mid-swap, the stamps with confetti, and the cursor with a burst.

## Concerns

1. **One first-press long task remains** (60–77 ms at 4× throttle; see above). If it matters on real phones, options:
   - warm motion up by running a no-op spring after load
   - wrap the deck's state update in `startTransition` so React yields
   - give the deck cards their own compositing layers so the first repaint is cheaper
2. **The route group move is structural.** `/home`, `/crews`, `/g/<id>`, `/new`, `/wallet` and `/profile` now live under `src/app/(app)/`, with the nav in `(app)/layout.tsx`. Screens no longer pass an `active` prop to `AppShell`; the nav reads the URL itself.
3. **The pixel cursor hides the system cursor across the whole page on mice and trackpads.** If the app ever freezes, there's no visible cursor until the overlay updates again. It also means accessibility settings that enlarge the system cursor won't apply on this site. It's off under reduced motion; consider a settings toggle later.
4. **The toast now lives at the bottom,** per this brief. In 3c-2a it was at the top.
5. **Every tap anywhere makes a burst,** including taps on form fields. That's what the brief asks for, but it could feel busy on the feed. It's easy to limit to buttons later.
6. **DoubleTapBurst and StampSlam aren't used on live screens yet.** They're demoed on `/dev/motion` and wait for 3c-2b's dare detail and result screens.
7. **Your dev server was left running.** A `next dev` was already on port 3000 when I started. I used it for the dev-mode checks and didn't stop it; it hot-reloaded the new code. My production checks used a separate `next start` on port 3001, which I stopped each time.
8. **Untracked files left as they were:** `VERIFY.md`, `.DS_Store`, the harmonies HTML, and the Gemini JPEGs.
