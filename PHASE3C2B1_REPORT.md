# BYW Phase 3c-2b-1: live proof camera, dare detail, create dare, feed

Built on 2026-11-06. **Testnet only, no contract changes.**

Commits:
- `bffc1bf` Phase 3c-2b-1: live proof camera, dare detail, create dare, feed
- `2a899d9` Let anyone who can see a public-crew dare react with fire. This makes the 🔥 button match the API's visibility rule.

Secrets checks before each commit:
- No `.env*` file was staged.
- All 8 secret values were scanned against the staged diff: 0 matches.
- Production client bundle: 0 secret values, and 0 copies of the dev-only capture test hook.

## SQL you ran: `supabase/migrations/002_proof_feed.sql`

- **`proof_sessions`** (new):
  - Columns: `id` uuid, `dare_id`, `wallet_address` (lowercase), `privy_user_id`, `code` (6 chars, `^[A-Z0-9]{6}$`), `issued_at`, `expires_at`, `used_at`.
  - Indexed by (dare, wallet). RLS on with no policies.
- **`proofs`:** adds `captured_at`, `kind` (`photo` or `video`, enforced), `duration_ms`, `poster_path`, `session_id`.
- **`reactions`** (new): `(dare_id, wallet_address)` primary key, `created_at`, an index by dare. RLS on.
- **`dares`:** adds `proof_at`, `settled_at`, `activity_at`, with an index on `(activity_at desc, id desc)`, plus a backfill from existing columns.
  - This goes beyond your spec. The feed sorts by latest activity, and `updated_at` can't be used for that because it changes on every sync.
- **Storage:** the `proofs` bucket now allows only `image/jpeg`, `video/mp4` and `video/webm`.

**Verified afterwards with the secret key:**
- Both new tables and all the new columns exist.
- The publishable key reads 0 rows from each.
- The bucket lists exactly those three types.

I then reset the sync cursor and re-synced from the deploy block (29 events, 4 dares, 19 s), so every dare has exact `proof_at`, `settled_at` and `activity_at` values.

## What was built

### A. Proof is live capture only

- **`POST /api/proofs/session {dareId}`:**
  - Only the onchain doer can call it, while the dare is Accepted and before its proof deadline.
  - It creates a session `{sessionId, code, issuedAt, expiresAt}` that lasts 15 minutes. The code uses an unambiguous alphabet (no 0/O or 1/I/L).
- **`POST /api/proofs/finalize`** now requires `sessionId`, `kind` and `capturedAt` (plus `durationMs` and `posterPath` for clips).
  - The session must exist, be for this dare, belong to this Privy user and this doer wallet, and be unexpired.
  - Photos must be JPEG. Clips must be MP4 or WebM, with a JPEG poster under 5 MB.
  - The file extension and magic bytes must match.
  - It stores `captured_at`, `kind`, `duration_ms`, `poster_path` and `session_id`, and marks the session used.
- **The upload rules match the bucket** (JPEG, MP4, WebM only). Gallery uploads for proof are gone from the live UI: the old `ProofSheet` and the old upload action were removed.
  - "post proof" on feed and home cards now opens the dare page, where the camera lives.
  - The `/dev` harness still has a file picker, now JPEG-only and using a capture session, because finalize requires one.
- **`ProofCamera`** (`web/src/components/camera/ProofCamera.tsx`), a full-screen sheet:
  - **Camera:** `getUserMedia` at an ideal 1280×720. It uses the back camera on phones and the front on desktop, with a flip button. The front-camera preview is mirrored, but captures are not.
  - **Shutter:**
    - Tap for a photo.
    - Hold, or switch to video mode and tap, to record up to 30 s, with a progress ring and auto-stop.
    - Keyboard: Enter or Space takes a photo, or starts and stops a clip in video mode.
  - **Receipt burned into every capture:** a dark bottom strip reading `BYW · @name · dare #id · <local date, time> · <code>`, plus a small lime corner mark, drawn on a canvas.
    - **Photos:** the camera frame plus the receipt, exported as JPEG at quality 0.85, at most 1440 px on the long side.
    - **Clips:** each frame plus the receipt is drawn every animation frame. `canvas.captureStream(30)` and the mic audio go into `MediaRecorder` at about 2.5 Mbps. It picks the first supported of MP4 (Safari, and current Chrome), WebM VP9, WebM VP8, then WebM. A JPEG poster (with receipt) is taken from the first frames.
  - **Permission and device states:**
    - Camera blocked: help text for iPhone Safari, Android Chrome and desktop (including the macOS privacy setting).
    - No camera found.
    - Page not secure (http).
    - Mic refused: falls back to silent clips.
  - **Review screen:** "retake" or "use it". Then upload (with a progress bar), poster upload, finalize, `submitProof` onchain, and sync, with TxToast states throughout.

### B. Dare detail `/d/<id>`

- **Header:** back button, "dare #id in <crew>", and the StatusTag.
- **OPEN:**
  - The dare text large, with the key phrase in lime.
  - "@creator dared @target" (or "anyone"), the bounty, and the time to do it.
  - A huge "AIGHT BET" if you can accept; "cancel dare" for the creator.
- **ACCEPTED, the countdown dial:**
  - A dark circle with a thick border that fills lime clockwise as the proof window is used up (`stroke-dashoffset`, springs).
  - Curved `textPath` labels: "YOU'VE GOT" on the left, "<time> LEFT" on the right.
  - A lime "POST PROOF" speech-bubble pill on top for the doer, which opens the camera.
  - The doer's avatar in the center, with "23 HR 12 MINS / time left" below.
  - Everyone else sees "@doer is on it". After the deadline, a settle (refund) button appears.
- **VOTING:**
  - The proof full width: a photo, or a clip with poster, controls and `playsInline`. Double-tap reacts with 🔥.
  - The "2 of 3 say it counts" spring bar, chips for who voted and how, and the time left to vote.
  - "it counts" / "nah" buttons, and "settle" once it can be settled.
- **RESULT:**
  - StampSlam slams once per dare, remembered in localStorage inside try/catch.
  - Result lines:
    - "@juju did it. 9,500 $wif paid. 500 burned."
    - "nah, cap. 4,500 back to @zee. 500 burned."
    - "no proof. 10,000 back to @ada."
  - "share" (copies the link until 3c-2b-2) and "re-dare" (`/new?group=<id>&amount=<payout>`).
- **CANCELLED:** a short note.
- **Who can see what:**
  - Crew members get everything.
  - Visitors to a public crew get a read-only view with a "join the crew" button. They can also react with 🔥, matching the API.
  - Private crews show "this dare is private".
- **Live updates:** the app's 20 s sync loop now also refreshes dare and feed data. A state change flips the StatusTag, swaps the dial for the proof, and triggers the stamp.

### C. Create dare `/new` (replaces the placeholder)

- **Headline:** "BET YOU / WON'T." with line 1 in the orange danger accent.
- **Crew picker:** chips; preselected from `?group`.
- **Text field:**
  - Visually prefixed with "bet you won't…", with a live counter out of 140.
  - Prefilled from `?text`.
  - The server-side blocklist still answers "keep it safe and legal".
- **Who:** "anyone in the crew" or a member chip (you're excluded).
- **Bounty:**
  - Quick picks 5k / 10k / 25k, each showing its USD value, plus a custom amount (prefilled from `?amount`).
  - Your balance is shown, with an error if you go over it.
- **Time to do it:** 1h / 24h / 3d / 7d.
- **Voting time:** 15m / 1h / 6h / 24h.
- **Witness rule:** a crew with fewer than 3 members shows "a dare needs a witness: invite 1 more friend" with an invite button.
- **Submit:**
  - It saves the draft, approves $wif if your allowance is short, then sends the dare.
  - While it works, the screen shows "1 approve $wif · 2 send dare".
  - Then it syncs, reads the new id from the `DareCreated` event in the receipt, and goes to `/d/<id>`.

### D. Home is a feed

- **Top bar:** the BYW wordmark (hidden on desktop, where the rail shows the logo) and a wallet balance pill.
- **Stories row:**
  - Round bubbles in a thick ring: lime = accept, violet = vote, orange = your proof, cream = settle.
  - Each is labelled ("accept", "vote", "proof", "settle") and opens `/d/<id>`.
  - Priority: your proof, then votes, settles, accepts, with the soonest deadline first.
  - "+ new dare" is always first.
- **Posts** come from `GET /api/feed`: your crews plus the public crew, newest activity first, 10 per page, with cursor pagination and infinite scroll (skeleton while loading).
  - **Media posts:**
    - A header with avatar, "in <crew> · 2h ago" and the tag.
    - 4:5 media with double-tap 🔥. Clips autoplay muted at 60% visibility, pause when scrolled away, play one at a time, and toggle sound on tap.
    - An action row with 🔥 and its count, share, and the bounty.
    - The caption "@creator dared @doer to …", then inline voting or the result line.
  - **Challenge posts:** a raised card with the big dare text, bounty, who dared whom, time to do it, and "AIGHT BET" when you can take it.
- **Reactions:** `POST /api/reactions` toggles your 🔥. It's limited to 120 an hour and allowed for crew members or anyone on a public-crew dare. The UI updates instantly and rolls back on error.
- **Desktop:** the feed column is capped at 600px; the right column shows "waiting on you" and your crews.

### E. API additions

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/proofs/session` | auth, doer, 30/h | Start a 15-minute capture session |
| POST | `/api/proofs/finalize` | auth, doer, 20/h | Requires a session; JPEG / MP4 / WebM only; stores capture metadata |
| GET | `/api/dares/<id>` | auth | Full dare with profiles, proof (url, kind, poster, captured_at), reactions, voters, flags; visibility rules above |
| GET | `/api/feed?cursor=` | auth | Media and challenge posts, 10 per page |
| POST | `/api/reactions` | auth, 120/h | Toggle 🔥 → `{reacted, count}` |

- The feed and dare routes are `no-store` and call a throttled sync capped at 1.5 s.
- Sync now records `proof_at`, `settled_at` and `activity_at` (the time of a dare's latest event).
- `/api/home` is unchanged; the stories row is derived from it on the client by `storiesFrom()`.

### F. Small fixes

- **Click/tap bursts:** they no longer fire on inputs, textareas, selects, contenteditable, or anywhere inside the camera sheet (`data-no-burst`).
- **Invite links:** set-up users who open one land on the wallet step's explicit "join <crew>" button. The wallet prompt only appears after that tap; nothing auto-joins on load.

## Tests and checks

- **`npm test`:** 101/101 pass. New and updated since 3c-2m:
  - receipt text formatting
  - capture-session validation: ok, missing, wrong dare, wrong user, wrong wallet, expired; plus session code format
  - MediaRecorder type picking and base type
  - fit to the long side
  - feed cursor round-trip and pagination
  - reaction toggle (in-memory store)
  - story bubbles: one per dare, priority and deadline order, which person each shows
  - countdown math (fraction used, the "23 HR 12 MINS" readout, the short label)
  - sync's activity, settle and proof times
  - finalize body validation (session required, kind enum, 30 s cap)
  - proof upload rules (PNG, WebP, HEIC and MOV now rejected)
- **Build, lint, types:** `npm run build` passes; `npm run lint` and `tsc --noEmit` are clean.
- **Production:** `/dev` and `/dev/motion` return 404; `/d/1`, `/new` and `/home` return 200.
- **Capture pipeline** (`node scripts/capture-check.mjs --upload`): uses Chromium's fake camera and mic in the real ProofCamera on mock dare 38, then checks the actual files. It passed on two runs, and a third run with `--webm` covered the WebM path.

  | Check | Result |
  |---|---|
  | Photo | real JPEG (`ff d8 ff`), 1280×720 |
  | Receipt in the photo | dark strip (median luma 26), cream text (max 249), lime corner mark (240 px) |
  | Clip, MP4 path | `video/mp4` (`ftyp`), 1280×720, 3.0 s (recorder 3060 ms), JPEG poster |
  | Clip, WebM path (`--webm`) | `video/webm` (`1a 45 df a3`), 1280×720, 3.0 s, JPEG poster |
  | Real `proofs` bucket via signed URLs | accepts the captured photo (200) and clip (200), rejects a PNG (400); test objects deleted |

- **Not run:** a full end-to-end upload → finalize → `submitProof` against testnet as a logged-in user. A script can't log into Privy (email codes or Google OAuth). Every piece of that path was covered separately above. The browser test in the next section completes it.
- **Layout checks** (`node scripts/screenshots.mjs`, fake camera on): all 81 screenshots pass:
  - no horizontal scroll
  - the bottom nav never covers content
  - no text cut at a viewport edge
  - no "robinhood"

  Rows that scroll sideways on purpose (stories and chip rows) fade out at the right edge and are skipped by the text-cut check.

## Screenshots (`design/screens/3c2b1/`, 81 files)

Mobile 390×844 @2x and desktop 1440×900. Phone screens with the bottom nav have `-top` and `-end` shots. New in this phase:

```
11-home                      the feed: stories row, media posts, challenge posts
17-create-dare               /new prefilled (crew, text, who, bounty, times)
21-dare-open                 OPEN with AIGHT BET
22-dare-accepted-yours       ACCEPTED dial with the POST PROOF bubble
23-dare-accepted-other       ACCEPTED, "@dayo is on it"
24-dare-voting               VOTING: proof, tally, voters, it counts / nah
25-dare-passed               PASSED stamp + result + share / re-dare
26-dare-failed               FAILED stamp
27-dare-expired              EXPIRED stamp
28-dare-cancelled            CANCELLED note
29-camera                    camera sheet live (fake camera), receipt preview, photo/video toggle, shutter
30-camera-review             review screen with the receipt burned in, retake / use it
```

The rest are the 3c-2a screens re-shot with the current UI. The old `17-new-placeholder` shots were deleted from `3c2a`, since that screen no longer exists.

## Please test (laptop webcam, three accounts)

You need three Privy logins:
- **A:** your email, normal window
- **B:** Google, private window
- **C:** another email, in a second browser

Each needs testnet ETH and mWIF: `cd contracts && ./script/fund.sh <address>`.

1. Run `cd web && npm run dev` and open http://localhost:3000 as **A**. Use a crew with A, B and C in it (create one in `/crews`, then have B and C join with its invite link).
2. **A:** tap the center **+** (new dare).
   - Pick the crew. Type `do a cartwheel in the office`. Set who = B, bounty 5k, time 1h, voting 15m.
   - Tap **send dare**. The first time you'll see "1 approve $wif" then "2 send dare" (two wallet prompts), and you land on `/d/<id>` showing OPEN.
3. **B:** the home stories row has a lime **accept** bubble. Open it and tap **AIGHT BET**. The page turns into the countdown dial with "YOU'VE GOT … LEFT" and the **POST PROOF** bubble.
4. **B, camera:** tap **POST PROOF** and allow camera and mic when the browser asks.
   - Check you see yourself, plus the receipt strip "BYW · @b · dare #… · time · code".
   - Tap the shutter for a photo, then **retake**.
   - Switch to **video**, record about 5 s, tap to stop, check the review plays, then tap **use it**.
   - Watch the upload percentage and the toast ("confirm in your wallet…", "sending…", "done"). The page should switch to VOTING with your clip, and the receipt should be visible in it.
5. **Camera blocked:** in your browser's site settings, block the camera and tap POST PROOF again. You should see the "camera is blocked" help. Unblock it afterwards.
6. **C:** home shows a violet **vote** bubble, and the clip in the feed autoplays muted. Tap it for sound.
   - Double-click the media for 🔥; the count goes up.
   - Tap **it counts**. With 3 members 1 vote decides it, so **settle it** appears; tap it.
   - The PASSED stamp slams with confetti, with the line "@b did it. 4,750 $wif paid. 250 burned." Reload: the stamp doesn't slam again.
7. **A:** open the dare. Check the result, then tap **re-dare**. `/new` should open with the crew and 4,750 prefilled.
8. **Expired path:** A dares C with time 1h. C accepts and doesn't post. After the hour, anyone taps **time's up: settle (refund)**. The EXPIRED stamp shows "no proof. … back to @a."
9. **Feed:** scroll home. Open dares show as challenge cards with **AIGHT BET**, and more posts load at the bottom. Public-crew dares from crews you're not in show read-only but can still be 🔥'd.
10. **Invite:** open a crew invite link while logged in as someone not in it. You should land on "join <crew>". Nothing should prompt your wallet until you tap it.

## Concerns

1. **No automated end-to-end proof run as a real user.** Upload → finalize → `submitProof` with a Privy session needs the browser test above. The camera files, the bucket and every server check were exercised separately.
2. **The receipt is deterrence, not proof of authenticity.** It's drawn by the client. Someone with dev tools could fake a capture, though they'd still need a valid 15-minute session code for that exact dare. Real attestation (signed captures, device checks) would be a later phase.
3. **iPhone Safari hasn't been tried.** This needs canvas `captureStream` plus `MediaRecorder` MP4 on a real device. It's the most likely place for surprises, especially audio sync and hold-to-record under iOS long-press (the context menu is suppressed and touch is locked on the shutter).
4. **A session expires after 15 minutes.** Finalizing after that fails with "Take the proof again", which means a retake.
5. **Abandoned captures stay in storage.** Retakes and failed attempts leave objects (clip and poster) in the bucket. The cleanup job from the 3c-1 concerns now matters more.
6. **The feed and dare page call a throttled sync** capped at 1.5 s, which can add up to that much latency when the 3 s throttle isn't active.
7. **Feed clips and live updates aren't in the screenshots.**
   - The mock fixtures only have photos, so `AutoVideo` (play at 60%, one at a time) hasn't been seen with a real clip.
   - Live state transitions (tag flip, dial to proof) depend on the 20 s sync loop. They need the browser test.
8. **The harness's proof upload is now JPEG-only** and uses a capture session; the server rejects anything else. Old 3c-1 proofs (PNG) still display, with their kind inferred.
9. **Share only copies the link** until the 3c-2b-2 share card.
10. **Your dev server on port 3000 was left running** and was used for the dev-mode checks. Production checks used a separate `next start` on port 3001, which I stopped.
11. **Untracked files left as they were:** `VERIFY.md`, `.DS_Store`, the harmonies HTML, and the Gemini JPEGs.
