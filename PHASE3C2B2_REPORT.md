# BYW Phase 3c-2b-2: 18+ gate, wifies, score and streaks, share card, wallet, profile

Built on 2026-11-07. **Testnet only, no contract changes, nothing deployed.**

Commit: `519b64b` Phase 3c-2b-2: 18+ gate, wifies, score and streaks, share card, wallet, profile

Secrets checks before the commit:
- The only `.env*` file staged was `web/.env.example`. It has variable names with empty values, as in earlier phases. The new line is `NEXT_PUBLIC_APP_URL=`.
- Staged diff scanned for the real values of `SUPABASE_SERVICE_ROLE_KEY`, `PRIVY_APP_SECRET`, `INVITE_SIGNER_PRIVATE_KEY` and the anon key: 0 matches. No 64-hex key-like strings were added.
- Production client bundle (`.next/static`): 0 secret values.
- Left untracked as asked: `VERIFY.md`, `.DS_Store`, the color harmonies HTML and the 4 Gemini JPEGs.

## SQL you ran: `supabase/migrations/003_score_age.sql`

- **`profiles.age_confirmed_at`** (timestamptz): set when someone ticks the 18+ box.
- **`user_stats`** (new), one row per wallet, recomputed after each sync that writes dares or votes:
  - `score`, `score_week`, `current_streak`, `best_streak`, `week_qualified`
  - `dares_done`, `dares_dared`, `wif_won`, `wif_burned` (wei, `numeric(78,0)`)
  - `updated_at`
- **`streak_freezes`** (new):
  - `wallet_address`, `privy_user_id`, `week` (checked against `^[0-9]{4}-W[0-9]{2}$`), `tx_hash` (unique), `amount`, `created_at`.
  - `unique(privy_user_id, week)` allows one freeze per user per week.
- RLS is on for both new tables, with no policies (server-only access).

**Verified afterwards:** both tables exist, the publishable key reads 0 rows, and a bad week format is rejected.

## What was built

### A. 18+ gate
- **Sign-in (O2):**
  - A required checkbox: "i'm 18 or older and i'll keep dares safe and legal." The three login buttons stay disabled until it is ticked.
  - An "i'm under 18" link opens "BYW IS 18+. come back when you're older." There is no way forward. It is remembered in localStorage (wrapped in try/catch).
- **The @name step** shows the checkbox again if this browser never ticked it, for example an invite-link signup.
- **`POST /api/profile`:**
  - Creating a profile needs `ageConfirmed: true`, otherwise it returns 403 "confirm you're 18+".
  - An existing unconfirmed profile is confirmed by sending the flag once.
- **Existing profiles** get a one-time modal ("ONE QUICK THING") covering the app until they confirm.
- **Write routes** answer 403 "confirm you're 18+" until then: permit, dare draft, proof session and finalize, reactions, group register, streak freeze, and upload-url (except avatar uploads during signup).

### B. Crews are now wifies (copy only; code identifiers still say group/crew)
- Headline "YOUR WIFIES. / NO CAP." plus "start a wifie", "join a wifie", "join with a code", "your wifies", "which wifie?".
- The witness message: "a dare needs a witness: invite 1 more friend to this wifie".
- `/crews` now permanently redirects (308) to `/wifies`. The nav label is "wifies".
- A one-time explainer: "wifies (pronounced wefeez): your dare groups".
- The public group is named "world is flat"; its card reads "join the world is flat wifie".

### C. Dare Score and weekly streaks
- **`src/server/score.ts`** (pure, no I/O):

  | Event | Points |
  |---|---|
  | Passed doer | +100 (+25 if the bounty is ≥ 10,000 $wif) |
  | Passed creator | +40 |
  | Failed doer | +10 |
  | Each vote | +5 |
  | Expired doer | −50 |

  - **Anti-farming:**
    - A dare scores only with a bounty of at least 1,000 $wif.
    - The same creator→doer pair earns from at most 2 dares per ISO week (UTC).
    - The pair cap covers Passed and Failed points. It does not cap the Expired penalty.
  - **Weeks** are ISO weeks in UTC (`src/lib/isoWeek.ts`).
    - A week qualifies if you were the doer or creator of a dare that Passed and settled that week, or if you froze it.
    - The current week never breaks a streak. Best streak is tracked too.
  - **Multiplier:** `min(1.5, 1 + 0.1 × (streakAtWeek − 1))`. It applies to positive points only, so penalties are never multiplied.
- **Storage and APIs:**
  - **`user_stats`** is recomputed after sync.
  - **`/api/me`** and **`/api/users/<name>`** compute live stats from a 5-second memoized snapshot.
  - **`GET /api/groups/<id>/leaderboard`** gives a weekly or all-time ranking, for members only. Members with 0 points are listed last.
- **UI:**
  - Profile: a big count-up score, a streak flame and the best streak.
  - Wifie page: a "leaderboard" tab with lime, violet and cream medals.
  - Flames (streak ≥ 2) next to names in the feed, members and leaderboard.
  - Dare result: a "+125 SCORE" pop with the bouncy spring.
  - Home: a "STREAK AT RISK" banner on Thursday–Sunday UTC with a "dare someone" button.

### D. Share card
- **`GET /api/og/dare/<id>`** renders a 1080×1920 PNG with `next/og`, using Archivo Black and Bricolage Grotesque (static TTFs in `src/assets/fonts`, OFL licence included). It shows:
  - the proof or poster in the top 2/3, with the receipt visible
  - the dare text with the key phrase in lime
  - the scallop stamp: PASSED, FAILED, EXPIRED or VOTING
  - the bounty, and @doer with avatar and flame
  - the footer "BET YOU WON'T · HOLD MY WIF" and `NEXT_PUBLIC_APP_URL`
  - Theme A colors and the dot texture
- **Visibility** follows the same rules as the dare page: members see it, anyone signed in sees public-wifie dares, and private dares are hidden.
- **Caching:** an in-memory cache keyed by dare state, outcome, proof, streak and avatar.
- **Images** are loaded server-side as data URIs, because `next/og` blocks localhost image URLs as an SSRF protection. Only local `public/` files and the Supabase host are allowed, up to 12 MB.
- **Share button** (it replaced the copy-only button everywhere):
  - If `navigator.canShare({files})` works, the native share sheet gets the PNG, the text and the link.
  - Otherwise a sheet shows the card with "download image" and "copy link".
- **Samples:** `design/screens/3c2b2/share-card-dare-36.png` (PASSED) and `share-card-dare-40.png` (VOTING).

### E. Streak freeze
- **When the offer shows:** your streak is at least 2 and either:
  - last week didn't qualify, or
  - this week ends in under 24 hours and hasn't qualified.
- **Button:** "save my streak: burn 2,000 $wif". The cost is one constant, `FREEZE_COST_TOKENS` in `src/lib/streak.ts`.
- **Flow:**
  1. The wallet calls `token.burn(2000e18)` through the normal TxToast flow.
  2. `POST /api/streak/freeze {txHash, week}` reads the receipt and checks:
     - there is a `Transfer` from the $wif token
     - from one of your linked wallets
     - to `0x0`
     - for at least 2,000e18
     - the transaction was not used before
     - at most one freeze per user per week
     - the week is the previous or current week only
  3. The freeze is stored in `streak_freezes` and stats are recomputed.
- **Effect:** the frozen week qualifies for the streak (no points) and the burn counts toward `wif_burned`. The flame does a "saved" pop.
- The real $wif token has `burn(uint256)` (the escrow already uses it), so the same flow works on mainnet.

### F. Wallet (full)
- @name and avatar; the address with copy and a QR code; ETH and $wif balances with USD.
- **"How to get $wif":**
  - Mainnet: "buy $wif on Pons" (links to the Pons launchpad page) plus a note to keep a little ETH for gas.
  - Testnet: "testnet: ask the team for test $wif".
  - Both show a gas line.
- **History:** settled dares (won, refunded, paid out or voted down, with amounts and explorer links) and streak-save burns, newest first.

### G. Profile (full): `/profile` and `/u/<username>`
- Tapping any avatar or @name in the feed, members, leaderboard or chips opens the profile.
- **Shows:**
  - avatar, @name, score, streak and best streak
  - a stats row: dares done, dares sent, $wif won, $wif burned
  - a 3-column proof grid with "did" and "dared" tabs; videos get a ▶ badge, and tapping a tile opens `/d/<id>`
- **Your own profile** adds "edit @name or photo", the save-my-streak button (when offered) and "log out".
- The grid only includes proofs the viewer may see: wifies they're in plus the public wifie.

### H. Invite sheet
- On the wifie page: the wifie name, a big QR code of `/i/<code>`, copy, and native share.
- A bottom sheet on phones and a centered modal on desktop.

## Scoring examples

| Case | Points |
|---|---|
| Passed doer, 10,000 $wif bounty, streak 1 | 100 + 25 = **125** |
| Same, while on a 3-week streak (×1.2) | **150** |
| Same, on a 6-week or longer streak (×1.5 cap) | **188** (rounded) |
| Passed creator, 5,000 $wif, streak 1 | **40** |
| Failed doer, 2,000 $wif | **10** |
| Expired doer (never multiplied) | **−50** |
| Dare with a 100 $wif bounty (below the 1,000 minimum) | **0** for everyone, votes included |
| A 3rd dare from the same creator→doer pair in one ISO week | creator and doer get **0** for it (votes still count) |

**Testnet results** after catching sync up to block 149873759 and recomputing:

| Wallet | Score | Streak (best) | Why |
|---|---|---|---|
| test wallet A `0x3b03…` | 125 | 1 (1) | dare #1 Passed as doer, 10k bounty: +100 +25 |
| @juju | 100 | 1 (1) | dare #5 Passed (5,000); dare #4's 100 $wif bounty is below the minimum. Won 4,845 $wif |
| deployer `0x0dac…` | 40 | 1 (1) | creator of Passed dare #1 (dare #2 expired; the penalty goes to the doer) |
| @minos | 40 | 1 (1) | creator of dares #4 and #5; only #5 scores (#4 is below the minimum) |
| @rukky | 5 | 0 (0) | one vote |
| test wallet B `0x43d8…` | −45 | 0 (0) | Expired as doer −50, one vote +5 |

Test wallet C only settled a dare, so it has no row. No streak freezes yet.

**18+ status:** @juju and @rukky have already confirmed through the modal. @minos is still unconfirmed and will see it on next visit.

## Tests and checks

- **`npm test`: 131 passed (13 files).**
  - `score.test.ts` (27):
    - ISO week boundaries in UTC, including the year rollovers (1 Jan 2027 is in 2026-W53, 4 Jan 2027 starts 2027-W01, 30 Dec 2024 is in 2025-W01)
    - every point rule, the 1,000 minimum (votes on those dares don't score either) and the big-bounty bonus
    - the pair cap (2 per week, resets next week, not applied to the Expired penalty)
    - streaks, gaps, frozen weeks, the current week not breaking a streak, and best streak
    - multiplier math and its 1.5 cap, freeze-offer timing, and the stats and leaderboard
    - freeze validation, with every failure case (wrong token, wrong sender, not a burn, too small, reused tx, wrong week either side, already frozen)
    - the age gate decision used by `/api/profile` and the write routes
    - share-card / dare visibility
  - `streak.test.ts` (3, new): the at-risk banner window (Thursday 00:00 to Sunday 23:59 UTC), qualified and no-streak cases, and the freeze cost constant.
  - Two older copy tests were updated from "crew" to "wifie".
- **`tsc --noEmit`, `eslint` and `npm run build`** are clean.
- **Production (`next start -p 3001`):**
  - `/dev` and `/dev/motion` return 404.
  - `/api/og/dare/36?mock=1` returns 401, so the mock param is ignored in production.
  - `/crews` returns 308 to `/wifies`.
  - `/u/juju`, `/profile` and `/wallet` return 200.
- **Layout checks** (`SET=3c2b2 node scripts/screenshots.mjs`) at 390 and 1440: all passed.
  - Each screen was checked for horizontal scroll, the bottom nav covering content, the brand name, and text cut at the viewport edge.

## Screenshots: `design/screens/3c2b2/`

Each name below exists in both `--mobile-390` and `--desktop-1440` versions. Phone screens with the bottom nav also have `-top` and `-end` versions.

- `02-o2-sign-in`: sign-in with the 18+ checkbox
- `13-wifies`: the wifies list with the explainer
- `18-wallet`: the full wallet
- `19-profile`: your profile
- `31-wifie-leaderboard`: the leaderboard tab
- `32-profile-other`: someone else's profile (`/u/dayo`)
- `33-invite-sheet`: the invite sheet (centered modal on desktop)
- `34-share-sheet`: the share sheet fallback
- `35-streak-at-risk`: the home banner (clock fixed to Saturday UTC)
- `36-result-score`: the dare result with "+125 SCORE"
- `37-age-modal`: the one-time 18+ modal
- `38-under-18`: the under-18 screen
- `share-card-dare-36.png`, `share-card-dare-40.png`: rendered share cards

## Manual test (testnet)

1. In a private window, open `/start?step=signin`.
   - The login buttons stay disabled until the 18+ box is ticked.
   - "i'm under 18" leads to a dead end, and reloading keeps you there.
   - Clear site data to undo it.
2. Sign up a new account: the @name step saves, and the profile has `age_confirmed_at` set.
3. Log in as @minos: the "ONE QUICK THING" modal appears. Tick it and confirm; it doesn't come back.
4. Open `/crews`: it redirects to `/wifies`, and the explainer shows once.
5. Open a wifie, then "leaderboard": switch between this week and all time. Tap a name to open `/u/<name>`.
6. Tap "invite": scan the QR code with a phone, and the invite link opens.
7. On a settled dare, tap share.
   - On a phone, the native share sheet offers the PNG.
   - On desktop, the sheet shows the card with download and copy link.
8. Settle a Passed dare with a ≥ 1,000 $wif bounty. The doer's result shows "+N SCORE", and the profile score and streak update after sync.
9. Streak freeze: needs a wallet with a 2-week streak and a missed week. Tap "save my streak: burn 2,000 $wif", confirm, and the flame pops "saved".
   - Re-submitting the same transaction should be refused.
10. Open `/wallet`: check the balances, the QR code, the testnet "ask the team" line, and history rows with working explorer links.

## Concerns

1. **The share card and dare links need a login.** `/api/og/dare/<id>` follows the dare page's rules, so it returns 401 for logged-out viewers. The PNG travels as a file through native share. But a pasted `/d/<id>` link won't unfurl with a preview image on X or WhatsApp. A public, signed or public-wifie-only OG image would fix that if you want it.
2. **The streak freeze isn't tested end to end on testnet yet** (0 rows). The validation is covered by unit tests, but the burn, receipt check and insert path needs manual test step 9. That needs a wallet with a qualifying streak history, which the current testnet data doesn't have.
3. **The full recompute will need replacing.** Stats are recomputed in full (all dares, votes and freezes) after each sync that writes something. That's fine at testnet size, but it needs an incremental version before real traffic.
4. **`user_stats` can be stale at a week rollover.** It is only rewritten when sync writes something. The UI reads live stats (`/api/me`, `/api/users`), so screens are right, but the table itself is stale until the next write.
5. **The 18+ gate is self-declared** (a checkbox plus a server timestamp); there's no ID check.
6. **Native share on desktop and headless isn't screenshotted.** In headless Chromium `navigator.share()` never settles, so the screenshot run hides `canShare` to capture the fallback sheet. Check native share on a real phone (manual step 7).
7. **The "crew" names live on in code.** Code identifiers (`Crews.tsx`, `CrewsScreen`, `group*`) were left as they were, as the spec says. Only user-facing copy changed.
8. **Screenshots add about 14 MB to the repo** (30 PNGs plus 2 cards).
