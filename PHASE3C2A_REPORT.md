# BYW Phase 3c-2a: design system, onboarding, home, crews, group feed

Built on 2026-11-06. **Testnet only.** No contracts or transactions were deployed or sent in this phase. All screens were checked with dev-only fixture data (`?mock=1`) and against the live API's public routes. **They have not yet been used with a real Privy login in a browser** (see "Please test").

Commit: `49f183a` Phase 3c-2a: design system, onboarding, home, crews, group feed.

Secrets checks before the commit:
- No `.env*` file was staged.
- All 8 secret values were loaded and scanned against the staged diff: 0 matches.
- Production client bundle: 0 secret values and 0 secret names.

## What was built

- **Design system:**
  - Tokens are in `web/src/app/theme.css` (harmony A) and exposed to Tailwind v4 through `@theme`.
  - Fonts come from `next/font/google`: Archivo Black (display), Bricolage Grotesque (body) and Caveat Brush (handwritten accents). These are the three the prototype uses.
  - Shared classes: `.raised` (3px border, 32px radius, 6px solid lip), `.press` (on press the lip drops to 2px and the element moves down 4px), `.field`, and `.pb-nav`.
  - Focus rings are 3px lime with a 3px offset.
  - `prefers-reduced-motion` turns off animations and the press motion.
- **Components** (`web/src/components/ui/`):
  - RaisedCard (+ SectionLabel)
  - PillButton (+ PillLink): primary lime, secondary violet, ghost, danger orange; loading and disabled states; 44px minimum height
  - Headline
  - StatusTag: OPEN, AIGHT BET, VOTING, PASSED, FAILED, EXPIRED, CANCELLED. Each tag always shows a symbol and the word.
  - Avatar, AvatarStack, AvatarChip
  - Money: heavy "5,000 $wif" with a small "(test)" on testnet, plus muted "≈ $7" from `/api/price`
  - BottomNav, DesktopRail
  - TxToast with four states:
    - "confirm in your wallet…"
    - "sending…"
    - "done" with a receipt link
    - "failed, try again" plus the decoded error in plain words
  - EmptyState, Skeleton, ScallopBadge (for later screens)
  - The prototype's hand-drawn icons
- **Shared transaction logic** (`web/src/hooks/`):
  - The harness's `useByw` moved here unchanged in behavior: wallet selection, chain switch, simulate → send → receipt → `/api/sync`.
  - `useActions` builds every action on top of it: accept, vote, settle, cancel, post proof, create group (with register), join (permit + `joinGroup`), and save profile.
  - The `/dev` harness now imports the same hooks.
- **Plain-language errors** (`web/src/lib/plainErrors.ts`):
  - All 23 escrow custom errors, plus wallet rejection, missing gas, rate limits and network failures. For example, `GroupTooSmall` becomes "a crew needs at least 3 people before anyone can dare."
- **Data:**
  - React Query hooks over the existing API, all with `cache: "no-store"`.
  - While the tab is visible: `/api/sync` every 20 s, then home, feed and me are refreshed. This also runs when the tab becomes visible again.
  - After every confirmed transaction: sync, then refresh everything.
- **API additions:**
  - `GET /api/groups/<id>/public`: public preview of a public group (name, member count, open and voting dares, 5 avatars). Private groups return 404. Rate limit 60/min/IP. It powers the "join the world is flat crowd" card.
  - `/api/me` and `/api/home` group lists now include up to 5 member profiles each, for avatar stacks.
- **Avatar upload:**
  - The input accepts only JPEG, PNG and WebP, so iPhones hand over a converted JPEG instead of HEIC.
  - Images are resized in the browser to at most 512px JPEG before upload, which also strips EXIF location data.
- **Dev-only fixture mode:** `?mock=1`, `?mock=empty`, `?mock=external`.
  - `NODE_ENV` is inlined at build time, so production can never turn it on.
  - Verified on a production server: `/home?mock=1` sends a logged-out visitor to `/start`.
- **Harness:** moved to `/dev`. It renders only when `NODE_ENV !== "production"`; the production server returns 404 (verified). The new `/new` placeholder links there, carrying `?group=` and `?text=` to prefill the harness's create-dare form.

## Token values used (theme A "complementary", from the design file)

| Token | Value | Role |
|---|---|---|
| page / bg | `#0C0C0F` / `#131317` | outside / app background |
| surface / inset | `#212126` / `#1A1A1F` | cards / inputs and tiles |
| border / lip | `#3A3A41` / `#2B2B31` | 3px borders / 6px solid bottom lip |
| text / muted | `#F2F0E6` / `#9C9A92` | cream / secondary text |
| primary / on-primary | `#B8DA3C` / `#14141A` | lime: primary buttons, active nav, PASSED |
| secondary / on-secondary | `#7251E4` / `#F2F0E6` | violet (`#7B5CE6` lightened to pass 4.5:1): secondary buttons, OPEN |
| danger / on-danger | `#D9784F` / `#14141A` | orange danger and "nah" (see Deviations) |
| accent / accent-2 | `#9077EA` / `#B8DA3C` | headline line 1 on group screens / home; key phrase in dares |
| money | `#9077EA` | bounty amounts |
| tags | OPEN `#7251E4`/cream · AIGHT BET `#CABDF5`/ink · VOTING `#F2F0E6`/ink · PASSED `#B8DA3C`/ink · FAILED `#421DBF`/cream · EXPIRED and CANCELLED `#55555D`/cream | |
| radii | cards 32px, fields 28px, pills 999px | |
| type | headlines Archivo Black uppercase, line-height 0.92, −0.03em (40/48/56px across breakpoints; the sign-in hero is 76px); body Bricolage 700–800, −0.03 to −0.045em; dare text 22px | |
| breakpoints | mobile < 768, tablet 768–1199 (`tab:`), desktop ≥ 1200 (`desk:`) | |

A unit test reads `theme.css` and checks all 20 text-on-fill pairs the UI uses: every one is at least 4.5:1.

## Routes

| Route | Screen |
|---|---|
| `/` | Routes you: logged out → `/start`; logged in without an @name → `/start?step=you`; otherwise → `/home` |
| `/start?step=how` | O1 how it works: 3 swipeable cards (scroll-snap) with rotated (−4°, 3°, −2°) black-and-white cut-out stickers; skip |
| `/start?step=signin` | O2: "BET YOU / WON'T.", "hold my wif", hero sticker, continue with email / google / connect wallet (each opens Privy with only that method) |
| `/start?step=you` | O3: @name with a live availability check (400 ms debounce), photo or doodle, "that's me" |
| `/start?step=wallet` | O4: "your wallet is ready", short address + copy, $wif and ETH balances, explainer, QR, "i've topped up" / "do this later". An external wallet on the wrong chain sees "switch to the right network". |
| `/start?step=crew` | O5: "join the world is flat crowd" (highlighted, live stats), "got an invite code?" (takes a link or a code), "start a group" |
| `/start?step=first&group=<id>` | O6: 3 suggested dares → `/new?group=&text=`; "skip, just look around" |
| `/i/<code>` | Invite variant: "@name invited you to <group>" note on every step. Skips O5. "join <group>" on the wallet step → permit + `joinGroup` → crew feed. Already-onboarded members go straight to the feed; already-onboarded users with gas join right away; without gas, the wallet step explains it. |
| `/home` | "WHAT'S THE / DARE TODAY?", "waiting on you" cards with one action each (aight bet / vote / post proof / settle), then your crews. Empty states include "start a group" and "join the world is flat crowd". |
| `/crews` | "YOUR CREWS. / NO CAP.", start a group, join with a code, crew list |
| `/g/<id>` | Crew name / "THE DARE BOARD.", member chips, invite (copies `/i/<code>`; Web Share on touch devices). Dares newest first. Inline actions: aight bet, it counts / nah with a live tally ("2 of 3 say it counts"), settle, cancel, post proof (bottom sheet). |
| `/wallet`, `/profile` | Minimal versions so the nav works: full address + QR; @name, photo, edit, log out |
| `/new` | Placeholder until the 3c-2b create screen. In development it links to `/dev` with your crew and text. |
| `/dev` | The 3c-1 harness, development only |

Desktop (≥ 1200px) adds a left rail and a right column:
- On home: the busiest crew's members and its live stats.
- On a group feed: "waiting on you" for that crew, its members, and its stats.

## Screenshots (`design/screens/3c2a/`, 49 files)

`web/scripts/screenshots.mjs` captured these at 390×844 (@2x) and 1440×900. On phone screens with the bottom nav, it takes a `-top` shot and an `-end` shot (scrolled to the end) instead of a full-page capture, because a full-page capture paints the fixed nav halfway down the image.

```
01-o1-how-it-works          --mobile-390 / --desktop-1440
02-o2-sign-in               --mobile-390 / --desktop-1440
03-o3-you                   --mobile-390 / --desktop-1440
04-o4-wallet-ready          --mobile-390 / --desktop-1440
05-o4b-switch-network       --mobile-390 / --desktop-1440
06-o5-your-crew             --mobile-390 / --desktop-1440
07-o6-first-dare            --mobile-390 / --desktop-1440
08-invite-o1                --mobile-390 / --desktop-1440
09-invite-o2-sign-in        --mobile-390 / --desktop-1440
10-invite-o4-wallet-join    --mobile-390 / --desktop-1440
11-home                     --mobile-390-top, -end / --desktop-1440
12-home-empty               --mobile-390-top, -end / --desktop-1440
13-crews                    --mobile-390-top, -end / --desktop-1440
14-crews-empty              --mobile-390-top, -end / --desktop-1440
15-group-feed               --mobile-390-top, -end / --desktop-1440
16-group-feed-empty         --mobile-390-top, -end / --desktop-1440
17-new-placeholder          --mobile-390-top, -end / --desktop-1440
18-wallet                   --mobile-390-top, -end / --desktop-1440
19-profile                  --mobile-390-top, -end / --desktop-1440
20-tx-toast                 --mobile-390 / --desktop-1440   ("confirm in your wallet…" after tapping aight bet)
```

Screens 01–02 are the real logged-out pages. Screens 03–20 use `?mock`.

**Automated checks: all pass on all 40 screen × viewport combinations:**
- No horizontal scroll at 390px.
- Scrolled to the end, the last content sits above the bottom nav.
- the brand naming check passes in visible text, the title, meta tags, `alt`, `aria-label`, `placeholder` or `title`.

The prerendered production HTML also has 0 mentions.

## Images

None are missing. The spec's `o1-dared.png`, `o1-proof.png`, `o1-paid.png` and `signin-hero.png` weren't in `web/public/onboarding` under those names; the folder held four `Gemini_Generated_Image_*.jpeg` files instead. Those are the same four photos on a dark background.

The design bundle contains the exact transparent cut-out PNGs, and its resource map names them `o1-dared.png` (bin rider), `o1-proof.png` (skateboarding grandma), `o1-paid.png` (card-playing ghosts) and `signin-hero.png` (traffic-cone head). I extracted those and committed them. The Gemini JPEGs are untouched and still untracked. If an image ever goes missing, the Sticker component renders a dashed placeholder box naming the file.

## Deviations from the prototype or brief, and why

1. **Design source file names.** `design/byw-prototype.html` and `design/byw-harmonies.html` don't exist. The only file is `design/Bet You Won't - 6 Color Harmonies.html`, a self-unpacking bundle that contains the full prototype (`BYWPrototypeOffline`, with its `THEMES` table) and every asset. I decoded it and rendered it with Playwright (phone and desktop, every screen) to study it. All tokens above come from its `THEMES.comp`.
2. **Danger is orange, not theme A's deep violet.** Theme A sets danger/"nah" to `#421DBF`. Your brief says "danger orange" and "nah (orange)", so I used `#D9784F`, the prototype's own base danger, which passes 5.2:1. The FAILED tag keeps theme A's `#421DBF`. To match the design file exactly, change one line (`--byw-danger`) in `theme.css`.
3. **Network wording.** The prototype says "base". The app says the chain's own name, "Robinhood Chain Testnet" (originally a short form; renamed after the audit), as allowed by the brand rule.
4. **@name length is 3–20.** The prototype says 3 to 15; the database and API allow 3–20, so the UI matches them.
5. **One "add a photo" button** instead of the prototype's separate "take a photo" and "upload". On phones the system picker already offers the camera, and one control is simpler to label accessibly.
6. **O5 order.** The highlighted crowd card comes first, as in the prototype, although your brief listed it third.
7. **O6 "send it"** goes to `/new` as specified. Until 3c-2b, `/new` is a note screen that links to `/dev` with your text and crew prefilled. Linking straight to `/dev` would 404 in production.
8. **Home "vote"** opens the dare on the crew feed (`/g/<id>#dare-<id>`), where "it counts" / "nah" and the tally live. That keeps one clear action per home card.
9. **Tablet (768–1199) uses the bottom nav** with a centered 720px column. The brief didn't specify tablet, and the rail is cramped below 1200.
10. **"$wif (test)":** the "(test)" is a small muted suffix so amounts never wrap onto two lines.
11. **Group feed members:** a horizontally scrolling row of AvatarChips, as your brief asked. The prototype used an avatar stack plus a count. On desktop the full list is also in the right column.
12. **CANCELLED** isn't in the prototype. It uses the EXPIRED gray with a ⊘ symbol.
13. **Added minimal `/wallet` and `/profile`** so all 5 nav items work. Their full designs aren't in this phase.
14. **Disabled Next's floating dev badge** (`devIndicators: false`), because it sat on top of the bottom nav.

## Tests and checks

- **`npm test`:** 81/81 pass (8 files). This includes 35 new tests:
  - key-phrase splitting
  - money, USD and time formatting
  - invite-code parsing
  - group-name fallback
  - plain-language errors
  - status tag mapping
  - "waiting on you" de-duplication and priority
  - feed status notes
  - the scallop path
  - the 20 theme contrast pairs
- **Build, lint, types:** `npm run build` passes; `npm run lint` is clean; `tsc --noEmit` is clean.
- **Production server:**
  - `/dev` → 404
  - `/home?mock=1` → redirects to `/start`, with no fixture data shown
  - 0 secrets in `.next/static`
- **Dev server against live data:**
  - `/api/groups/1/public` returned 5 members, including your `@minos` profile and avatar.
  - `/api/groups/999/public` → 404.
  - Every page route returns 200.

## Please test (needs a real login)

1. `cd web && npm run dev`, then open http://localhost:3000 logged out. You should land on O1; swipe the cards, then skip to O2.
2. Continue with email (a new account). You should go to O3: type an @name and watch the availability check; add a photo and confirm it uploads small.
3. O4: check that the balances and QR are right. Fund the wallet with `contracts/script/fund.sh <address>`, then tap "i've topped up".
4. O5: join the world is flat crowd (it signs a permit and joins), then pick a dare on O6.
5. On `/home` and `/g/1`, try aight bet, post proof, it counts / nah, and settle with a second and third account. Watch the toast states and the receipt link.
6. Create a group in O5 or `/crews`, copy the invite from its feed, and open it in a private window. Onboard as a new person: the invite note should show on every step, and "join <group>" on the wallet step should land you on the feed.
7. Log in with an external wallet (e.g. MetaMask on another network). O4 should show "switch to the right network".

## Concerns

1. **Real-login flows are untested in a browser.** The transaction code is the harness's proven code, now called from new buttons, but please run the steps above.
2. **Fixtures ship in the production bundle.** They are inert, because the `?mock` reader is compiled to `false`. A dynamic import would drop them entirely.
3. **The invite auto-join prompts a wallet signature as soon as the page loads.** This applies to already-onboarded users with gas who open an invite link. That's what the brief asks for, but a "join" button tap may feel less surprising.
4. **Each visible tab calls `/api/sync` every 20 s.** The server throttles to one sync per 3 s and runs one at a time, but every call still costs a database round-trip. A cron (concern #1 in 3c-1) would let tabs just refetch.
5. **The "world is flat crowd" name is filled in on the client only.** Group 1 has no stored name. Registering a name in the database, which only its creator, the deployer, can do, would make the name consistent everywhere.
6. **Your group 2 is public and unnamed,** so it shows as "crew #2".
7. **Proof uploads still accept HEIC,** which most browsers can't display. This is carried over from 3c-1, and the avatar input already excludes it. Decide in 3c-2b whether to convert or block it.
8. **Fonts are fetched from Google Fonts at build time** by `next/font`, so builds need network access.
9. **The screenshot script uses an existing Chromium** via `CHROME=...`, because Playwright 1.65's own browser isn't downloaded on this machine. Without that variable it needs `npx playwright install chromium`.
10. **Untracked files left as they were:** `VERIFY.md`, `.DS_Store`, the harmonies HTML in `design/`, and the four Gemini JPEGs.
