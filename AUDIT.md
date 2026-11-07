# Bet You Won't: security and quality audit

**Date:** 2026-11-07
**Scope:** `contracts/src/BYWEscrow.sol`, the mainnet deployment on Robinhood Chain (chain 4663), `web/` (Next.js 16, Privy, Supabase, Vercel), `supabase/migrations/`, and the git history.
**Method:**
- Static review of every contract function, API route and server module.
- Tooling: `forge test`, `forge coverage`, `npm audit`, a production build with a scan of the client bundle, and a pattern scan of the full git history.
- Read-only checks of the live deployment: contract settings over the public RPC, HTTP headers on betyouwont.vercel.app, and Supabase table reads with the publishable key.

No code was changed and no transactions were sent. No secret values were printed: the secret checks compared values inside the shell and reported only whether each was found.

---

## Fixed after audit (2026-11-07)

Contract v2 is live at [`0xA23143a995898DA008700921da498bdA5dFF8811`](https://robinhoodchain.blockscout.com/address/0xA23143a995898DA008700921da498bdA5dFF8811) (deploy block 108389945, Sourcify exact match). v1 (`0xc8A4…713E`) is paused; it held 0 $wif and 0 dares. The fixes are in commit `9ab12e8` ("Contract v2: voter snapshot at creation, no-votes refund, public cap, no renounce"). The app re-point is in the commit "Mainnet v2: redeploy and re-point app".

| ID | Status | What changed |
|---|---|---|
| H-1 | **Fixed**, with residual risk | **Contract:** `createDare` stores `voterSnapshot` (the member count at creation). `vote` requires `memberJoinIndex <= voterSnapshot`. `eligible` is fixed on accept: the snapshot, minus the creator, minus the doer if the doer is inside the snapshot. Wallets added after a dare exists can never vote on it or change its thresholds.<br>**Public groups:** a new `publicMaxBounty` caps public-group dares at 20,000 $wif.<br>**Tests:** a fake-voter attack test, doer inside and outside the snapshot, a late-joiner fuzz, and invariants (`eligible <= voterSnapshot - 1`).<br>**Residual risk:** wallets that joined the public wifie *before* a dare was created still count. The public cap limits the exposure. M-3 (single-key owner and signer) is unchanged. |
| M-2 | **Fixed** | New outcome `NoVotes`: zero votes at `voteEnd` refunds the creator 100%, with no burn. With at least one vote the old rules apply. The app shows a NO VOTES stamp with "nobody voted. bounty back to @creator.", and the outcome scores 0 points for both sides. A mainnet fork test against the real $wif confirms an exact 100% refund with total supply unchanged. |
| L-2 | **Fixed** | `renounceOwnership` always reverts with `RenounceDisabled`. |

Contract checks for v2:
- 92 tests pass, including 2 mainnet fork tests (a pass burns exactly 5% of the real supply; no votes refunds exactly 100%).
- 100% line, statement, branch and function coverage on `BYWEscrow.sol`.

The app-side fixes for the other findings are listed in "Audit fixes" above.

---

## Audit fixes (2026-11-07, app-only)

Contract fixes are in `9ab12e8`. Every other fix is in the app commit `5d75368` ("Audit fixes: app security, legal pages, reports, deletion"). That commit adds no contract changes. Its SQL is `supabase/migrations/005_audit_fixes.sql`, applied and verified.

| ID | Status | What changed |
|---|---|---|
| H-1 | **Fixed** (`9ab12e8`) + hardened | **Contract (v2):** voters are snapshotted when the dare is created.<br>**App:** a public wifie gives each Privy account a permit for one wallet only (`public_permits`), and only once the account is 10 minutes old. Blocked profiles get no public permits. |
| H-2 | **Fixed** | Proof media is looked up by `(dare_id, proof_hash)`. It shows only if the proof row was finalized for that exact dare by that dare's doer (`server/proofMatch.ts`). A copied hash shows "proof missing". This covers the feeds, the dare API, both share-card routes, profile grids and the admin queue. Tests include the cross-dare hash attack. |
| M-1 | **Fixed** | **Bucket:** `proofs` is private.<br>**URLs:** 1-hour signed URLs, made only after each route's visibility check, reused for 50 minutes per server instance.<br>**Share cards:** fetch the media server-side.<br>Avatars stay public. |
| M-2 | **Fixed** (`9ab12e8`) | A dare with no votes refunds the creator 100% (`NoVotes`). |
| M-3 | **Accepted** (open) | The owner is still a single deployer wallet, and the invite signer key still lives on the server. Recommended: move ownership to a multisig, and keep the signer key in a KMS. |
| M-4 | **Fixed** | **Upload links:** a proof upload link needs an active, unused capture session owned by the caller. Each session allows one in-flight upload per role (the media file, or a video's poster). A retake deletes the previous file.<br>**Budgets:** 300 MB of proof and 10 avatars per user per rolling 24 h (`uploads` ledger). An old avatar is deleted when you save a new one.<br>**Daily cleanup:** Vercel Cron calls `/api/cron/cleanup` with `CRON_SECRET`. It removes, after 24 h: proof files and posters not linked to a dare's finalized proof, proof rows that never went onchain, expired sessions, unreferenced avatars, and old ledger and rate-limit rows. |
| M-5 | **Fixed** | Sync commits the cursor after each written chunk (`sync_progress`, which holds the lease). A refused or oversized range is split in half. Each pass has caps of 3,000 logs and 45 s. Malformed events and rows are skipped and logged. The cursor never moves past an unwritten chunk. |
| M-6 | **Fixed** | An unknown dare id never forces a sync: only an id that exists onchain waits for a normal throttled sync. Per-user (30/min) and per-IP limits apply on `/api/dares/<id>`, `/api/home`, `/api/feed` and `/api/groups/<id>/feed`. `/api/sync` allows 30/min per IP. |
| M-7 | **Fixed** | **Enforced on every route:** `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and HSTS.<br>**Report-only:** a full CSP allowing Privy, WalletConnect, Supabase and the Robinhood Chain RPCs. In a production-build browser run (home, onboarding, legal pages, invite page, and the Privy login modal with its iframe) it reported **0 violations**, so it can be enforced next. |
| M-8 | **Fixed** | **Pages:** `/terms`, `/privacy` and `/guidelines`, linked in the footer and from the 18+ checkbox.<br>**Reporting:** a report action on every feed post and dare. Content auto-hides after 2 reporters (public wifie) or 3 (private), and it's hidden for the reporter at once.<br>**Admin:** `/admin` (`ADMIN_WALLETS`) can hide or unhide, delete a proof file, block, or delete a profile's data, and every action is logged.<br>**Deletion:** "delete my profile". |
| M-9 | **Partly fixed** | Signing up now requires agreeing to the terms. The 18+ gate is still self-attested, and the under-18 answer still lives in the browser. |
| M-10 | **Fixed** | **Rename:** the chain is named "Robinhood Chain" / "Robinhood Chain Testnet" (UI and Privy), and docs and reports now use the full name. AUDIT.md still quotes the old wording only where it describes the original finding.<br>**Checker:** the screenshot checker allows exactly "Robinhood Chain" and fails on any other "Robinhood" or "RH Chain". |
| L-1 | **Accepted** | A contract trait; the public cap limits the exposure. |
| L-2 | **Fixed** (`9ab12e8`) | `renounceOwnership` reverts. |
| L-3 | **Fixed** | Sessions are single-use: `used_at` is checked and claimed atomically. Finalize also requires that the files were issued for that session. |
| L-4 | **Fixed** | A freeze burn must be mined within the week it saves, or within the last 7 days, and after the user's previous qualifying week. |
| L-5 | **Fixed** | The public share card is rate limited per IP (60/min). Any other query string redirects to the canonical `?v=` URL, and the version includes the hidden state. |
| L-6 | **Fixed** | Sync reads only up to the latest block minus 3. |
| L-7 | **Fixed** | Registration is atomic (`register_group`), so an existing code is never replaced. The creator can rotate the invite code from the invite sheet ("new invite link"), and old links stop working. |
| L-8 | **Remaining** | Privy is already at its latest version (3.51.3). The 29 production advisories (18 high, 11 moderate) all sit in Privy's, WalletConnect's and wagmi's transitive dependencies. `npm audit fix` without `--force` changes nothing. Trying wagmi 3 *raised* the high count to 20, so it was reverted. |
| L-9 | **Fixed** | Score and leaderboard reads go through a paged `selectAll`, so there's no 1,000-row cap. |
| I-1 / I-2 / I-4 / I-6 | Accepted | — |
| I-3 | Accepted | `x-forwarded-for` is set by Vercel. Signed-in routes are now limited per user as well. |
| I-5 | **Fixed** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` was removed from `.env.example` and the deploy docs. |
| I-7 | **Fixed** | See M-10. |

---

## Executive summary: top 5 issues

1. **A dare can be won with fake voters (High, contract).** The list of people who can vote on a dare is fixed when proof is posted, not when the dare is created. Anyone can join the public wifie, so someone who accepts a dare there can add a few extra wallets of their own before posting junk proof. Those wallets vote "pass", and the bounty pays out to the attacker. Honest members cannot outvote them. The contract can't be changed, so the real fix is a redeploy. Until then, the app can stop handing out instant invites to the public wifie and lower the maximum bounty.
2. **Anyone can show someone else's private proof on their own public dare (High, server).** The app finds a dare's proof file by the proof's hash alone. An attacker can copy a private proof's hash from the chain into their own public dare, and the app will then show the victim's private photo or video in the public feed and on the share card, which needs no login. The fix is a few lines: only show a proof whose stored dare and doer match the dare being viewed.
3. **Every proof file has a permanent public link (Medium).** Proofs live in a public storage bucket, private wifies included. The links can't be guessed, but once a link leaks (forwarded, unfurled in a chat, or through issue 2) it works forever and can't be revoked. Making the bucket private and handing out short-lived signed links fixes this.
4. **Free file hosting can use up the free storage tier during judging (Medium).** Any free account can get 30 upload links an hour, at 50 MB each, and uploads that are never used as proof are never deleted. One script could fill Supabase's free 1 GB of storage in under an hour, and proof uploads would then fail for everyone.
5. **Missing safety, legal and brand basics (Medium).**
   - No security headers: the site can be framed for clickjacking on money-moving buttons.
   - No terms, privacy or community-guidelines pages, and no way to report or remove content.
   - The 18+ gate is a self-declared checkbox.
   - The UI names the network "RH Chain" (including inside the Privy wallet modals), where the brand rule requires "Robinhood Chain".

**What's solid:**
- **Funds:** there is no path to steal, strand or pay out escrowed $wif twice.
- **Contract tests:** 100% line and branch coverage of the contract.
- **Mainnet:** the deployment matches the source.
- **Database:** RLS blocks the publishable key on every table, checked live.
- **Secrets:** none in the client bundle or the git history.
- **Auth:** Privy token checks and the linked-wallet checks are correct.

---

## Findings table

| ID | Severity | Area | Finding | Location |
|---|---|---|---|---|
| H-1 | **High** | Contract | Voter set is snapshotted at proof time, so the doer can add wallets and buy the vote (live in public wifie 1) | `contracts/src/BYWEscrow.sol:328-337`, `:505`; `web/src/app/api/permit/route.ts:28-38` |
| H-2 | **High** | Server | Proof lookup by hash only: a private proof can be attached to a public dare and is then shown publicly, including on the no-login share card | `web/src/server/dareView.ts:16-24` |
| M-1 | Medium | Data | `proofs` bucket is public, so private-wifie proof URLs are permanent and can't be revoked | `supabase/migrations/001_init.sql:215-220`; `web/src/server/dareView.ts:37-40` |
| M-2 | Medium | Contract | A dare with no votes passes, and the doer picks when voting starts (e.g. 4am with a 15-minute window) | `BYWEscrow.sol:507`, `:511` |
| M-3 | Medium | Contract/Ops | Owner is a single EOA; the invite-signer key is a hot key on the web server; either key can mint permits for any group, enabling H-1 everywhere | `BYWEscrow.sol:410-414`; `web/src/server/signer.ts` |
| M-4 | Medium | Storage | `/api/upload-url` is free public file hosting (30 × 50 MB/h per free account), with no cleanup of abandoned files or old avatars | `web/src/app/api/upload-url/route.ts:12-25` |
| M-5 | Medium | Sync | A sync pass is all-or-nothing over up to 200k blocks; spamming cheap `createGroup` events can stall indexing for everyone | `web/src/server/sync.ts:37-42`, `:128-224` |
| M-6 | Medium | Server | Opening an unknown dare id forces a sync pass with no rate limit, which amplifies load on the paid RPCs and functions | `web/src/app/api/dares/[id]/route.ts:24-27` |
| M-7 | Medium | Client | No CSP, `frame-ancestors`/X-Frame-Options, nosniff, Referrer-Policy or Permissions-Policy (live headers checked; only HSTS present) | `web/next.config.ts` (no `headers()`) |
| M-8 | Medium | Policy | No terms, privacy or guidelines pages; no report or takedown path; proofs and group names are unmoderated | `web/src/app` (absent); `web/src/server/moderation.ts` |
| M-9 | Medium | Policy | 18+ gate is a self-attested checkbox; the under-18 choice lives in localStorage; the contract can be called directly | `web/src/lib/ageGate.ts`; `web/src/server/age.ts` |
| M-10 | Medium | Brand | The network is shown as "RH Chain" in the UI and in Privy modals (brand rule: "Robinhood Chain" in full) | `web/src/lib/chains.ts:7`, `:21` (used in WalletCard, Onboarding, providers) |
| L-1 | Low | Contract | Anyone can accept an untargeted dare and lock the creator's bounty for up to 7 days (refunded in full later) | `BYWEscrow.sol:308-322` |
| L-2 | Low | Contract | `renounceOwnership` is callable, which would freeze signer rotation forever | inherited `Ownable` |
| L-3 | Low | Server | A capture session can be reused (`used_at` is written but never checked); `capturedAt` is client-supplied | `web/src/app/api/proofs/finalize/route.ts:101` |
| L-4 | Low | Server | Streak freeze accepts any old burn (block time not checked against the week) | `web/src/server/freeze.ts`; `web/src/app/api/streak/freeze/route.ts` |
| L-5 | Low | Server | Public share-card render has no rate limit; a random `?v=` busts the edge cache | `web/src/app/api/og/public/dare/[id]/route.ts` |
| L-6 | Low | Sync | No confirmation depth and rows are never deleted, so a reorged join or vote would stay in the DB | `web/src/server/sync.ts:135`; `web/src/server/access.ts:24` |
| L-7 | Low | Server | Two concurrent registrations of a group can overwrite its invite code; there is no way to rotate a leaked code | `web/src/app/api/groups/register/route.ts:42-71` |
| L-8 | Low | Deps | 29 prod advisories (18 high, 11 moderate), all transitive in Privy, WalletConnect and wagmi; no direct server exposure found | `web/package-lock.json` |
| L-9 | Low | Reliability | Scores and leaderboards read without paging, so they will silently truncate at PostgREST's 1,000-row default | `web/src/server/stats.ts:15-17` |
| I-1 | Info | Contract | Escrow assumes a plain ERC-20 with no fees; true for $wif (not upgradeable, no owner or mint). Never redeploy against a fee, rebasing or blocklist token | `BYWEscrow.sol:279`, `:288` |
| I-2 | Info | Contract | No sweep (tokens sent directly to the contract are stuck); no event when a vote locks early; `Voted` keeps firing after a lock | `BYWEscrow.sol` |
| I-3 | Info | Server | `clientIp` trusts the first `x-forwarded-for` (fine on Vercel; spoofable behind any other proxy) | `web/src/server/http.ts:66-70` |
| I-4 | Info | Server | Different 404 messages reveal that a private dare id exists; the linked-wallet cache keeps an unlinked wallet working for 30 s | `web/src/app/api/dares/[id]/route.ts`; `web/src/server/auth.ts:24-29` |
| I-5 | Info | Config | `NEXT_PUBLIC_SUPABASE_ANON_KEY` is defined in env but unused; remove it so it never ships | `web/.env.example` |
| I-6 | Info | Verification | Sourcify exact match; Blockscout verification not submitted | `contracts/deployments/mainnet.json` |
| I-7 | Info | Brand/docs | "RH Chain" and "Robinhood" used alone appear in the docs and reports (list below) | various `*.md` |

---

## Details

### H-1: fake voters can decide a dare (contract)

**Where:**
- `submitProof` sets `eligible = memberCount - 2` from the group's member count *at proof time* (`BYWEscrow.sol:328-337`).
- `_outcomeOf` locks a pass when `passVotes * 2 >= eligible` (`:505`).
- `joinGroup` is open to anyone who holds a permit (`:226-239`).
- `/api/permit` signs a permit for any logged-in 18+ user in a public group (`permit/route.ts:28-38`). Its rate limit is 10 per hour per Privy user, and Privy accounts are free. One account can also link several wallets.

**Scenario (public wifie 1, live now):** the group has `n` honest members and an open, untargeted dare worth B.
1. The attacker joins and accepts the dare.
2. Before posting proof, they join `k = n - 1` more wallets. Now `eligible = (n + 1 + k) - 2 = 2k`.
3. They post junk proof, and their `k` wallets vote pass: `2k >= 2k`, so pass locks.
4. They call `settle` in the same block and receive 0.95 × B.

The honest members' `n - 1` fail votes can never reach `2(n-1) > 2k`, so they can't stop it.

Targeted dares are exposed too, because the target chooses when to post proof. The creator can play the mirror attack: add wallets before proof, then vote a genuinely completed dare as failed and get back 90%. PHASE1_REPORT.md lists this as known, but it now affects real funds through an open group.

**Fix (needs a new deployment):**
- Snapshot `membersAtCreate` in `createDare`. Only members with `seq <= membersAtCreate` may vote, and `eligible` is derived from that snapshot.
- Consider a strict majority plus a minimum number of votes for a pass.

**Until a redeploy:**
- Stop issuing permits for group 1 on demand: require an invite code or creator approval, or add a per-group daily cap.
- Lower `maxBounty` with `setMaxBounty`, which applies to new dares only.
- If abuse is seen, `pause()`. It blocks only new dares and groups; existing escrows still settle.

### H-2: a private proof can be pulled into a public dare (server)

**Where:**
- `proofsByHash` (`web/src/server/dareView.ts:16-24`) maps `proof_hash → file` with no check on `dare_id` or uploader.
- It is used by `/api/dares/[id]`, `/api/feed`, `/api/users/[username]`, and both share-card routes.
- The contract accepts any `bytes32` as `proofHash`.
- The finalize-route dedupe (`finalize/route.ts:74-80`) is skipped when the attacker calls the contract directly.

**Scenario:**
1. A victim's proof in a private wifie emits `ProofSubmitted(dareId, H)`, which is public onchain.
2. The attacker accepts a 1-token dare in a public group and calls `submitProof(theirDare, H)` directly.
3. Sync stores H on the attacker's dare, and every view resolves it to the victim's file.

The victim's photo or video then appears:
- in the public feed;
- on `/api/og/public/dare/<id>`, which needs no login;
- in link unfurls.

The same bug lets a doer show voters someone else's convincing proof.

**Fix:** pass `(dareId, proofHash)` pairs and accept a row only when `proofs.dare_id = dare.id` and `proofs.uploader_wallet = dare.doer_wallet`. Otherwise show "no proof".

### M-1: proofs bucket is public

**Where:** `001_init.sql:215-220` creates `proofs` with `public = true`. `dareView.ts:37-40` returns `getPublicUrl` links.

**What's protected:** paths are `proof/<wallet>/<uuidv4>.<ext>`, so they can't be guessed. Anonymous users can't list the bucket: the live check with the publishable key returned no buckets.

**The risk:** every URL a member's browser receives is valid forever, for anyone, and cached by the CDN. That covers former members, forwarded links, devtools and chat unfurls.

**Fix:**
- Make `proofs` private.
- Return `createSignedUrls(paths, 3600)` only after the `crewAccess` check.
- In `shareCard.imageData`, use `.download()` instead of fetching the public URL.
- Avatars can stay public.

### M-2: silence passes, and the doer chooses the moment

**Where:** after `voteEnd`, the result is a pass when `passVotes >= failVotes`, so 0–0 passes (`BYWEscrow.sol:507`). The 15-minute window is allowed (`:511`).

**Scenario:** the doer posts junk proof at 4am with a 15-minute window. Nobody votes, and the doer is paid 95%. In a 4-member group, one friendly pass vote locks a pass immediately (`2 >= 2`).

This is documented as by design (PHASE1_REPORT #5), but with real money it makes low-effort proof profitable.

**Fix (redeploy):** require at least one pass vote, or a quorum, and refund the creator in full when nobody votes. Alternatively, start the window only after a minimum delay.

### M-3: key concentration

**Owner key:** `owner()` on mainnet is the deployer EOA `0x0DAC…1779`, and `pendingOwner()` is zero.

**Invite-signer key:** loaded from env into the Vercel function (`web/src/server/signer.ts`).

**Impact:** a leak of either key lets the holder sign permits for every group, private ones included, and run H-1 on any dare without proof yet. Owner powers are otherwise limited: pause new dares, change `maxBounty` for new dares, rotate the signer. There is no sweep and no way to touch escrowed funds.

**Fix:**
- Transfer ownership to a multisig (`transferOwnership`, then `acceptOwnership`).
- Keep the signer key in a KMS, or at least a separate secret scope.
- Write a short incident runbook: rotate the signer to a dead address to freeze joins. Pausing does not stop `joinGroup`.

### M-4: upload abuse and storage growth

**Where:** `/api/upload-url` (`upload-url/route.ts:12-25`).

**What's missing:**
- A proof URL is issued without checking for a live capture session or that the caller is a doer.
- Avatar URLs need no profile and no 18+ confirmation.
- The declared `size` is checked by zod but not bound to the signed URL; only the bucket's 50 MB / 5 MB `file_size_limit` holds.
- Magic bytes are checked only at finalize, so any bytes sent with an allowed `Content-Type` are stored at a public URL the uploader knows.
- Nothing ever deletes unused uploads, posters, or replaced avatars: there is no cron and no `.remove()`.

**Fix:**
- Require an owned, active `sessionId` for proof URLs.
- Upload to a private staging prefix and move the file at finalize.
- Add a scheduled job (Vercel cron or pg_cron) that deletes unreferenced objects older than about 1 h.
- Delete the old avatar on save.
- Add a per-wallet daily byte quota.

### M-5: sync can be stalled

**Where:** `web/src/server/sync.ts:37-42`, `:128-224`.

**How a pass works:**
- It reads logs in 5,000-block chunks, up to 40 chunks (200k blocks).
- It calls `getBlock` for every touched block and `getGroup`/`getDare` for every touched entity, 4 at a time.
- The cursor advances only if the whole pass succeeds; on failure it is left unchanged.

**Scenario:** `createGroup` is permissionless and costs only L2 gas, and it emits 2 logs.
1. A burst of thousands of calls inside one window can push `getLogs` past provider result limits; there is no range-halving on error.
2. Or the burst makes the pass longer than the 120 s lease.
3. Every later pass retries the same range and fails again.
4. The DB stops seeing new joins, dares and votes.

Funds stay safe onchain, but the app looks frozen.

**Fix:**
- Commit the cursor after each chunk.
- Halve the range on `getLogs` errors.
- Cap entities per pass.
- Batch reads with multicall.
- Keep the function's `maxDuration` above the lease TTL.

### M-6: forced sync amplification

**Where:** `/api/dares/[id]` calls `sync({ force: true, waitMs: 8000 })` whenever the id isn't in the DB (`route.ts:24-27`). There is no rate limit.

**Scenario:** one signed-in user fires parallel requests for `/api/dares/999999999`. Each request holds a function open for about 8 s or more and runs extra RPC calls on QuickNode and GetBlock. It may also trigger `recomputeStats()`, which does a full scan and upsert.

**Fix:**
- Rate-limit misses per user.
- Check `dareCount()` onchain before forcing a sync.
- Never pass `force` from a read path.

### M-7: security headers

The live response from https://betyouwont.vercel.app/ has `strict-transport-security` (added by Vercel) and `access-control-allow-origin: *` on static HTML. It has none of:
- `Content-Security-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`

`next.config.ts` has no `headers()`, and there is no middleware or proxy.

**Scenario:** an attacker frames `/d/<id>` or `/new` and overlays decoys to steer clicks onto "accept" or "post" and onto Privy's confirmation modal.

**Fix:** add `headers()` for `/:path*` with:
- `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, then grow it into a full policy that allows the Privy, WalletConnect, Supabase and RPC origins;
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`.

### M-8: legal pages and unsafe content

**What exists:** no `/terms`, `/privacy` or `/guidelines` routes, and no report button, `reports` table or admin takedown path. Moderation is a regex blocklist on dare text only (`moderation.ts`, used in the draft route). Proofs and group names are not checked.

**Scenario:** someone posts a sexual, violent or doxxing proof to the public wifie. It shows in every member's feed and on the no-login share card. Removing it takes a manual service-role delete.

**Fix:**
- Add the three pages and link them from the sign-in step, next to the 18+ checkbox.
- Add `POST /api/reports`, rate-limited.
- Add a `hidden_at` column on proofs and dares that every read path honors.
- Add an admin script that also deletes the storage object.

### M-9: 18+ gate

**Server side:** `requireAdult` checks `profiles.age_confirmed_at`, which is set whenever the client sends `ageConfirmed: true`. It is enforced on permit, register, draft, proof session, finalize, reactions and freeze; upload-url skips it for avatars.

**Client side:** the "I'm under 18" choice is kept only in localStorage (`web/src/lib/ageGate.ts`), so clearing site data resets it. Calling the contract directly skips the gate entirely.

**Fix:**
- Store the under-18 answer server-side, keyed by Privy user, and refuse a later confirmation.
- Record the attestation version.
- Get advice on whether real-money bounties need stronger age checks.

### M-10: brand naming ("RH Chain")

**Where:** `web/src/lib/chains.ts:7` (`"RH Chain Testnet"`) and `:21` (`"RH Chain"`) are shown to users through:
- `components/app/WalletCard.tsx:73` ("for gas on {chain}");
- `components/onboarding/Onboarding.tsx` (around lines 461–522: "runs on {chain}", "switch to {chain}", "send it a little ETH on {chain}");
- `app/providers.tsx:29-30`, which passes the chain to Privy, so the short name appears in Privy's modals and in the network name wallets receive.

**Fix:** rename it to `"Robinhood Chain"` (mainnet) and `"Robinhood Chain Testnet"`.

Not found:
- in metadata, OG images, the manifest or `public/`;
- as "Chain" alone in UI text;
- the phrase "tokenized stock(s)" anywhere;
- Robinhood's name in the project name, logo or handles ("Bet You Won't", "BYW", "$wif").

### Low findings

| ID | Details and fix |
|---|---|
| **L-1** | **Problem:** a stranger can accept an untargeted dare, even front-running `cancelDare`, and never post proof, so the bounty is locked for up to `doDuration` (max 7 days). The creator is then refunded in full.<br>**Fix:** an accept allowlist or window, or targeted-only dares in public groups. |
| **L-2** | **Problem:** if the owner renounces by mistake, the signer can never be rotated again.<br>**Fix:** override `renounceOwnership` to revert in the next deployment. |
| **L-3** | **Problem:** `proof_sessions.used_at` is set but never checked, so one session can finalize several files within 15 minutes. `capturedAt` is client-supplied, so API-only users can finalize camera-roll images.<br>**Fix:** `update … where used_at is null returning` (atomic single use) and check `capturedAt` against the session window. |
| **L-4** | **Problem:** the freeze verifier checks the token, burn address, sender, amount, status and reuse, but not *when* the burn happened.<br>**Fix:** require the receipt's block time to fall within the week being saved. |
| **L-5** | **Problem:** a satori render plus up to two 12 MB image fetches per request, with no rate limit.<br>**Fix:** limit by IP, and redirect to the current `?v=` instead of rendering. |
| **L-6** | **Problem:** sync reads up to `latest` and never removes rows, and `crewAccess` trusts DB membership.<br>**Fix:** stay a few blocks behind head, or check membership onchain for sensitive reads. |
| **L-7** | **Problem:** two concurrent registrations can both see no row, and the second overwrites the first invite code. There is no endpoint to rotate a code.<br>**Fix:** `coalesce(groups.invite_code, excluded.invite_code)` plus a creator-only rotate route. |
| **L-8** | **Findings:**<br>• `npm audit --omit=dev`: 29 advisories (18 high, 11 moderate, 0 critical). The full audit adds 8 moderate, from eslint and minimatch, dev only.<br>• All prod advisories are transitive through `@privy-io/react-auth`, `@reown/appkit`, `@walletconnect/*`, `wagmi` and `@coinbase/cdp-sdk`. They cover zod 3.25.76 memory exhaustion, ws 8.18.0 DoS/disclosure, decode-uri-component ReDoS and uuid bounds, and run in the browser wallet stack.<br>• The server's direct `zod` is 4.6.7, past the fix in 4.6.6. viem's `ws` is only used by WebSocket transports, which the server doesn't use.<br>**Real risk:** low.<br>**Fix:** upgrade Privy when its v3 line ships fixed transitive deps, and re-audit. Don't force `npm audit fix --force`, because it would downgrade Privy to 3.6.1. |
| **L-9** | **Problem:** `scoreSnapshot` selects all dares, votes and freezes without paging. Past 1,000 rows, PostgREST's default cap silently truncates scores.<br>**Fix:** page the reads or move the aggregation into SQL. |

---

## Area-by-area notes

### 1. Smart contract

**Tests:**
- `forge test`: 79 passed, 0 failed (4 suites, including the invariant suite and the mainnet fork suite).
- `forge coverage` (non-fork suites) on `BYWEscrow.sol`: 100% of lines (145/145), statements, branches (40/40) and functions (23/23).

**Untested:**
- the fake-voter (H-1) and timing (M-2) scenarios;
- `renounceOwnership`;
- settlement when the token's `transfer` or `burn` reverts;
- malleable or 64-byte signatures (handled by OZ ECDSA);
- the fork suite covers only the pass path, not the failed or expired paths.

**Mainnet matches the source** (public RPC, read-only):

| Call | Value | Expected |
|---|---|---|
| `token()` | `0x5173…4773` | real $wif ✓ |
| `inviteSigner()` | `0xa629…81bf` | backend signer ✓ |
| `owner()` | `0x0DAC…1779` | deployer EOA ✓ (see M-3) |
| `pendingOwner()` | `0x0` | no transfer pending |
| `maxBounty()` | 500,000e18 | ✓ |
| `paused()` | false | ✓ |
| `$wif.balanceOf(escrow)` | 0 | no live escrows yet |

Runtime code size is 11,068 bytes. Sourcify reports an exact match.

**Verified safe:**
- **Payouts:**
  - Each bounty leaves escrow exactly once: Open → Cancelled, or Accepted/Voting → Settled.
  - `burned + payout == amount`, because the burn rounds down and the payout is the remainder.
  - An invariant test shows the contract balance equals the sum of live bounties.
- **Reentrancy:** `createDare`, `cancelDare` and `settle` are `nonReentrant` with effects before interactions. SafeERC20 is used throughout, and `transferFrom` always pulls from `msg.sender`.
- **Pause:** it blocks only `createGroup` and `createDare`, so it never traps funds.
- **No stuck funds:**
  - Every Accepted dare expires to a refund.
  - Every Voting dare becomes settleable after `voteEnd`.
  - Anyone can call `settle`.
- **Signatures:**
  - The OZ 5.5 EIP-712 domain includes `chainId` and `verifyingContract`, so a permit can't be replayed on another chain.
  - OZ ECDSA rejects high-s (malleable) signatures.
  - Each permit is bound to its group, account and deadline.
  - Membership is permanent, so a permit works only once.
- **Votes:**
  - The creator and the doer can never vote, and nobody can vote twice.
  - The two early locks are mutually exclusive and can't be undone.
  - `eligible >= 1` always holds.
  - The deadline checks (`<=` for posting proof, `>` for settling) don't overlap and are tested at both edges.

### 2. Server and API routes

**Verified safe:**
- **Privy token check:** `verifyAccessToken` checks the ES256 signature, issuer, audience (the app id) and expiry.
- **Wallets:** the acting wallet must be in Privy's `linked_accounts`. Neither `X-Wallet-Address` nor `body.address` can claim an unlinked wallet.
- **CSRF:** tokens are sent as Bearer headers, not cookies.
- **Permits:**
  - Signed only for the caller's own linked wallet.
  - Whether a group is public is read from the chain.
  - Private groups need the invite code, compared in constant time. Codes have about 8 × 10¹⁴ possibilities and are rate-limited, so brute force is infeasible.
  - Permits expire after 10 minutes.
- **Write authorization uses the chain:** onchain membership for drafts and the group feed; the onchain doer and state for proof sessions and finalize; the escrow's `GroupCreated` log for register.
- **Sync poisoning:** `getLogs` is filtered to the escrow address, entity data is re-read from the contract, and dare text attaches only when the draft's `metaHash`, group and creator all match. Fake events from other contracts are ignored.
- **Sync lock:** a `FOR UPDATE` lease, the cursor can't go backwards, and the lock functions are callable only by `service_role`.
- **Storage paths:** strict regex validation (no traversal); the path wallet must be the doer; magic bytes and extension are checked; the same file can't be reused across dares through the API (but see H-2).
- **Price route:** fixed upstream URLs (no SSRF), 5 s timeout, 60 s cache with in-flight dedupe.
- **Share cards:** images are fetched only from the Supabase host over https, at most 12 MB.
- **Private dares:** public previews and cards require `groups.is_public` (synced from the chain); private dares get generic previews.
- **Reactions:** checks for auth, 18+ and `canSee`; one reaction per dare and wallet (upsert); 120 per hour.
- **Errors:** production 500s are generic; RPC URLs are redacted from logs and errors.
- **Rate limiter:** atomic in Postgres and fails closed with a 503.

**Rate-limit caveat:** every per-user limit is keyed by Privy user id, and accounts are free, so expect bypasses using several accounts. That matters most for uploads (M-4) and permits (H-1). IP limits use `x-forwarded-for`, which is safe on Vercel (I-3).

### 3. Data (Supabase)

**RLS:**
- All 13 tables have RLS enabled and no policies, and there are no extra grants.
- `rate_limit_hit`, `sync_try_lock` and `sync_unlock` are SECURITY INVOKER, with EXECUTE revoked from `public`, `anon` and `authenticated` and granted only to `service_role`.

**Live check:** reading every table with the publishable key returned `[]`, including `groups`, `group_members` and `sync_state`, which do have rows. Listing buckets with it also returned `[]`.

**The browser never queries Supabase directly.** It only PUTs files to server-issued signed upload URLs.

**Storage:** see M-1 (public proofs bucket) and M-4 (abuse and growth). Bucket size and MIME limits exist only in the migrations (`on conflict do nothing`), so confirm the live bucket settings in the dashboard.

### 4. Client

**XSS:** none found.
- User text renders through React text nodes.
  - Dare text is at most 140 characters.
  - Usernames are limited to `^[a-z0-9_]{3,20}$`.
  - Group names are at most 40 characters.
- `dangerouslySetInnerHTML` is used only for QR SVGs that `qrcode` generates.
- `generateMetadata` output is escaped by Next. Satori renders text, not HTML.
- There is no JSON-LD.

**Open redirects:** none. There is no `next=` or redirect parameter, and every push or link goes to an internal path.

**Client bundle** (fresh `npm run build`, mainnet env): none of the secret values or server-only env names were found in `.next/static`. That covers the Privy secret, the Supabase service key, both private RPC URLs and all five private keys. The client only reads `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_NETWORK`, `NEXT_PUBLIC_PUBLIC_GROUP_ID`, `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SUPABASE_URL`.

**Security headers:** see M-7.

**Dependencies:** see L-8.

### 5. Secrets hygiene

**Ignore rules:** `.gitignore` covers `.env*` (with an exception for `.env.example`), `contracts/broadcast/` and `/backups/`. The only env-like file tracked by git is `.env.example`.

**History scan** (24 commits, all refs) for added lines matching generic patterns:

| Pattern | Matches | What they are |
|---|---|---|
| 64-hex `0x…` | 77 | All benign: tx hashes in `contracts/deployments/*.json` and `*_REPORT.md`, and sha256 test vectors in `hashing.test.ts` |
| QuickNode and GetBlock URL shapes | 1 each | Fake fixtures in `rpcUrls.test.ts` (marked "Fake endpoints only") |
| JWTs, `sb_secret_`, PEM private keys, AWS, GitHub and Stripe tokens, `PRIVATE_KEY=` assignments | 0 | — |

**Real values:** each real secret value was compared against the full history inside the shell, printing only found or not found. That covers all five private keys and the token parts of both RPC URLs. None were found.

**Server-only boundary:**
- Every module that reads a secret (`env.ts`, `chain.ts`, `redact.ts`) starts with `import "server-only"`.
- No `"use client"` file reads a non-public env var.
- `app/layout.tsx` imports constants from `server/linkPreview.ts`. That module is pure, so this is harmless, but moving it to `lib/` would keep the boundary clean.

### 6. Policy and compliance

**Brand occurrences:**

| Category | Occurrences |
|---|---|
| UI | "RH Chain" and "RH Chain Testnet" through `chains.ts:7`, `:21` (M-10). The dev-only harness (`HarnessPage.tsx:23`, `:65`) shows it too. |
| Docs: "RH Chain" | `DEPLOY.md:3`; `web/README.md:3`; `PHASE3C1_REPORT.md:3`; `PHASE3C2A_REPORT.md:145`; `WEB3A_REPORT.md:70`, `:173` |
| Docs: "Robinhood" alone | `VERIFY.md:24`, `:130-134`, `:168` ("Robinhood (official)", "Robinhood Mainnet", "Robinhood's … docs"); `PHASE3C1_REPORT.md:133-134` ("Robinhood pair"); the `"robinhood"` brand-guard notes in `PHASE3C1_REPORT.md:160`, `PHASE3C2A_REPORT.md:131`, `WEB3A_REPORT.md:119`, `PHASE3C2B1_REPORT.md:182`, `PHASE3C2M_REPORT.md:107` |
| Code comments | `web/src/lib/chains.ts:18` ("Robinhood's network docs") |
| Correct usage ("Robinhood Chain" in full) | `MAINNET_REPORT.md`, `TESTNET_REPORT.md`, `DEPLOY.md:38-39`, `VERIFY.md`, `contracts/README.md`, deployment JSON, contract script and test comments |
| Identifiers, hostnames and URLs (not prose) | `*.chain.robinhood.com`, `robinhoodchain.blockscout.com`, the GeckoTerminal `networks/robinhood` slug in `server/price.ts:31`, `:42`, the `rhChain` identifiers, `foundry.toml` `robinhood =` RPC alias |
| "tokenized stock(s)" | none |
| Robinhood logos | none |

**Hackathon rule:** the project name, logo and handles ("Bet You Won't", "BYW", the lime and violet mark) don't use Robinhood's name or logo. ✓

**Legal and safety:** see M-8 and M-9.

**Free-tier headroom** (estimates; confirm current plan limits in each dashboard):

| Service | Usage drivers | Headroom |
|---|---|---|
| **Supabase storage** (free tier, 1 GB) | A 30 s video at 2.5 Mbps (1280 px) is about 9–10 MB. A 1440 px JPEG is about 0.3–0.6 MB. | Roughly 100 video proofs or about 2,000 photos. **Abuse (M-4) can fill it in under an hour.** Most likely free-tier failure. |
| **Supabase egress** (free tier, about 5 GB per month) | Public URLs serve straight from Supabase. One video viewed by every member of a 10-person group is about 95 MB. | About 500 full video plays per month. A judging day with 50 judges each watching 10 videos uses about 5 GB. **Tight.** |
| **Supabase database** (500 MB) | Rows are small. | Ample. |
| **Vercel functions** (Hobby) | Each open tab polls `/api/sync` plus home/feed every 20 s, about 540 requests per hour per tab. 50 judges for 2 hours is about 54k invocations, well within the monthly allowance. Satori share cards are the CPU-heavy route (L-5). M-6 lets one user hold many functions open for about 8 s each. | Fine at normal load. Note that Hobby is for non-commercial use. |
| **Privy** | Whether the app is in development or production mode can't be seen from code. Development-mode apps have user caps and allowed-origin limits. | **Confirm production mode and `betyouwont.vercel.app` in allowed origins before judging.** |
| **RPC** | Sync is throttled to one pass per 3 s across all users: about 2–3 calls per pass, so at most about 60k calls per day with constant traffic. `getLogs` costs extra credits on QuickNode. GetBlock rejects 5,000-block ranges, so it rarely serves sync. The public RPC is the last fallback. Browsers and Privy always use the public RPC. | Fine for judging. Watch QuickNode credits if M-6 is abused. |

### 7. Reliability

**If a provider goes down:**
- **QuickNode down:** viem falls back to GetBlock, then the public RPC. Range errors fall through as well. The only cost is speed.
- **All server RPCs down:** sync fails and the cursor stays put; it catches up after recovery. Onchain funds are unaffected. Transactions still go out through the browser's public RPC, but the app won't show the results until sync recovers.
- **Supabase down:**
  - Every rate-limited route fails closed with a 503, which is safe but means all writes stop.
  - Reads return 502.
  - The UI retries reads twice, then shows an error state.
  - An onchain action still completes, and the DB catches up through sync.
- **Privy down:** nobody can sign in or sign transactions. There is no fallback.

**Stuck UI:**
- The transaction flow resets `busy` in a `finally` block.
- `waitForTransactionReceipt` (`hooks/useByw.ts:123`) relies on viem's default timeout. If the public RPC stalls, the toast stays on "working" until viem gives up.
- Optimistic reactions roll back on error.

**Many judges at once:**
- The single global sync lease plus the 3 s throttle keeps the RPC load flat.
- Concurrent requests wait up to `waitMs` for the lock and then serve DB data, so heavy load means slower freshness, not errors.
- The risks are M-5 (a stall), M-6 (amplification) and the Supabase egress and storage limits above.
- Leaderboards will truncate past 1,000 rows (L-9). That's unlikely during judging.

---

## Safe to keep live?

**Yes, with fast follow-ups.** Escrowed $wif can't be stolen by the owner, can't get stuck, and can't be paid out twice. The contract matches its source, the database is locked to the server, and no secrets have leaked.

**The main live risk is H-1.** In the open public wifie, someone running several accounts can steal a dare's bounty by voting it through. Exposure is capped by `maxBounty` (500k $wif, about $615 at $0.00123) and by what creators choose to post.

**Before judging, do these (about a day of work, no redeploy needed):**
1. Fix H-2: match proofs by dare and doer.
2. Gate permits for the public wifie, and consider lowering `maxBounty`.
3. Make the proofs bucket private and use signed URLs.
4. Require a capture session for upload URLs, and add an orphan-cleanup cron.
5. Add security headers.
6. Rename "RH Chain" to "Robinhood Chain".
7. Add a minimal terms, privacy and guidelines page and a report button.
8. Confirm Privy is in production mode.

**For the next contract deployment:** fix H-1 and M-2, block `renounceOwnership`, and move ownership to a multisig.
