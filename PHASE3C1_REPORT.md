# BYW Phase 3c-1: Supabase backend, API routes, chain sync, test harness

Built on 2026-11-06. **Testnet only** (Robinhood Chain testnet, 46630). Mainnet was not touched, nothing was deployed, and I sent no transactions in this phase (every chain call was a read).

Secrets were loaded inside commands only and never printed. The client bundle (`.next/static`) contains 0 secret values and 0 secret variable names. Before the commit, the staged diff was scanned for all 8 secret values from `web/.env.local` and `contracts/.env`: 0 matches. No `.env*` file was staged.

Commit: `b2b1f02` Phase 3c-1: Supabase backend, API routes, sync, test harness.

## Database (`supabase/migrations/001_init.sql`)

You ran it once in the SQL Editor. I then checked with the secret key that all 9 tables and both buckets exist. The publishable key reads 0 rows from every table. Calling the SQL functions with the publishable key is refused with permission denied (42501).

| Table | Key | What it holds |
|---|---|---|
| `profiles` | `privy_user_id` | `wallet_address` (unique, lowercase), `username` (citext, unique, `^[a-z0-9_]{3,20}$`), `avatar_url`, `ring_color` |
| `groups` | `id` = onchain groupId | `name` (1–40 chars), `is_public`, `creator_wallet`, `invite_code` (unique), `created_tx`, `created_at` |
| `group_members` | (`group_id`, `wallet_address`) | `joined_at`, `join_tx` |
| `dare_drafts` | `meta_hash` | `group_id`, `creator_wallet`, `text`, `salt` |
| `dares` | `id` = onchain dareId | every field from `getDare`, plus `text` (from the draft), `payout`, `burned`, `created_tx`, `settled_tx` |
| `votes` | (`dare_id`, `voter_wallet`) | `pass`, `tx_hash`, `created_at` |
| `proofs` | `proof_hash` (sha256) | `dare_id`, `uploader_wallet`, `storage_path`, `mime`, `size_bytes` |
| `sync_state` | `id` = 1 | `last_block`, `updated_at`, `lock_holder`, `lock_until` |
| `rate_limits` | `key` | `count`, `window_start` |

- **Indexes:**
  - dares by (`group_id`, `created_at desc`), by `state` and by `meta_hash`
  - members by wallet
  - votes by voter
  - proofs by dare
- **RLS** is on for every table, with no policies.
- **Buckets** (public read):
  - `proofs`: 50 MB; jpeg, png, webp, heic, mp4, quicktime, webm
  - `avatars`: 5 MB; jpeg, png, webp
- **Additions beyond the spec:**
  - `dares.text`: the spec has sync fill it in, but it was missing from the column list.
  - The `sync_state` lock columns.
  - Two server-only SQL functions, so no migration 002 was needed:
    - `rate_limit_hit`: an atomic fixed-window counter.
    - `sync_try_lock` / `sync_unlock`: a single-runner lock. It expires on its own after 120 s and also enforces the 3-second throttle.
  - The username check is on `username::text`. A regex on a `citext` column ignores case, so without the cast `ABC` would pass.

## API routes

Every route validates its input with zod. Writes require a Privy access token. A request acts as the wallet in `X-Wallet-Address`, and the server only accepts it if Privy lists that wallet as linked to the user.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/sync` | public | Runs `sync()`. Returns `{status, lastBlock, latestBlock, …}`. |
| GET | `/api/price` | public | `{usd, source, fetchedAt}`. `usd` is null if both price APIs fail. |
| GET | `/api/profile/check?username=` | public, 30/min/IP | Is this @name valid and free? |
| GET | `/api/invite/<code>` | public, 60/min/IP | Invite preview: group name, member count, creator `@name` and avatar, `is_public`. |
| POST | `/api/upload-url` | auth, 30/h | `{kind, mime, size}`. Checked against the bucket rules; returns a signed upload URL for `kind/<wallet>/<uuid>.<ext>`. |
| POST | `/api/profile` | auth, 20/h | `{username, avatarPath?}`. Upserts the profile. A new profile gets one of the 6 theme colors. The avatar must exist, be the caller's, and pass a magic-byte check. |
| GET | `/api/me` | auth | Your profile, plus your groups with name, member count, live-dare count and invite code. |
| POST | `/api/groups/register` | auth, 20/h | `{txHash, name}`. Details below. |
| POST | `/api/permit` | auth, 10/h | `{groupId, inviteCode?}`. Details below. |
| POST | `/api/dares/draft` | auth, member onchain, 30/h | `{groupId, text}`. Details below. |
| POST | `/api/proofs/finalize` | auth, doer onchain, 20/h | `{dareId, storagePath}`. Details below. |
| GET | `/api/groups/<id>/feed` | auth, member onchain | The feed. Details below. |
| GET | `/api/home` | auth | "Waiting on you": `toAccept`, `toVote`, `needsProof`, `toSettle`, plus your groups. |

More detail on the larger routes:

- **`/api/groups/register`:**
  - Reads the receipt and only trusts `GroupCreated` events emitted by the escrow itself.
  - The creator must be one of the caller's linked wallets.
  - Saves the name and creates a 10-character invite code. The alphabet has no 0, o, 1, l or i.
  - Returns the group and `/i/<code>`.
  - Calling it again renames the group and keeps the same code.
- **`/api/permit`:**
  - A public group lets any logged-in user join.
  - A private group needs the invite code, compared in constant time.
  - It then checks that the group exists onchain, that the wallet isn't already a member, and that the server key matches `inviteSigner()`. Then it signs exactly as in phase 3a.
  - The rate limit is now stored in the database, replacing 3a's in-memory map.
- **`/api/dares/draft`:**
  - Trims the text and requires 3–140 characters.
  - The blocklist returns "keep it safe and legal".
  - `metaHash = keccak256(abi.encode(groupId, creator, text, salt))` with a random 32-byte salt.
- **`/api/proofs/finalize`:**
  - The dare must be in Accepted state, before its deadline, and the caller must own the doer's wallet. The upload path must also belong to the doer.
  - It downloads the object and checks size, mime, that the extension matches, and magic bytes.
  - `proofHash` = sha256 of the bytes. The same file can't be reused as proof for a different dare.
- **`/api/groups/<id>/feed`:**
  - Returns the group, its members with profiles, and stats: open, live, paid out, refunded and burned.
  - Lists dares newest first with text, profiles, amounts, state, outcome, deadlines, tallies, and the proof's public URL and mime.
  - For each dare it includes the caller's flags: `canAccept`, `canSubmitProof`, `canVote`, `canSettle` (with the outcome), and `canCancel`.

The register route runs a forced `sync()` after its transaction. It waits up to 15 s if another sync is running, so the new group appears right away. The harness also calls `/api/sync` after every confirmed transaction.

Every GET route calls `await connection()` before anything else. With Next 16's `cacheComponents` setting, a GET handler that doesn't read request data is prerendered at build time. Without that call, `/api/sync` and `/api/price` would have been frozen into the build. The build output lists every API route as dynamic (`ƒ`).

## How sync works (`src/server/sync.ts`, `src/server/syncMap.ts`)

1. **Lock.** `sync_try_lock` locks the single `sync_state` row, so callers on every server instance queue at that one row. It returns:
   - `busy` if another sync holds an unexpired lock.
   - `throttled` if the last sync finished under 3 s ago, unless the call is forced.
   - Otherwise it takes a 120 s lock. On the first run it starts the cursor at deploy block − 1.
2. **Read logs.**
   - It reads every escrow log from the cursor up to the latest block, in 5,000-block chunks. Each call handles at most 40 chunks; anything left is picked up on the next call.
   - It re-reads the last 100 blocks each time, in case an RPC node was behind last time.
   - The logs are decoded with the ABI. Block timestamps come from `getBlock`.
3. **Read state.** For each group and dare the logs touch, it reads the authoritative struct from the contract (`getGroup` / `getDare`). Member joins and votes come straight from their events.
   - Dare text is copied from the draft whose `metaHash` matches. The group and creator must match too.
   - Payout, burned and the settle tx come from `DareSettled`.
4. **Write.** It upserts groups, then members, dares and votes.
   - Rows are batched by key set, so a bulk upsert never sets a column to null just because this pass didn't learn it, such as `created_tx`.
   - A group's `name` and `invite_code` are never touched by sync.
5. **Unlock.** On success it unlocks and advances the cursor. On any error it unlocks without moving the cursor, and the next call retries the same range. Every write is an upsert, so re-running a range does no harm.

Big numbers (`amount`, `payout`, `burned`) are read as `::text`. PostgREST would otherwise send them as JSON numbers, which lose precision above 2^53. 10,000 tokens in wei is 1e22.

## Sync verification (read-only, against testnet)

`npm run verify-sync` (`web/scripts/verify-sync.mjs`) reads every group and dare from the escrow and compares them with Supabase. Result: **55/55 PASS**.

| | Chain | Supabase |
|---|---|---|
| Group 1 | creator deployer, public, 5 members | matches; 5 member rows, all `isMember` onchain, `joined_at` = onchain `joinedAt` |
| Group 2 | creator `0xcb47…3c35` (your browser wallet), public, 1 member | matches |
| Dare 1 | Settled / **Passed**, 10,000 mWIF, tallies 1/0 of 2 eligible | matches; payout 9,500, burned 500, created and settled txs |
| Dare 2 | Settled / **Expired**, 1,000 mWIF | matches; payout 1,000, burned 0 |
| Dare 3 | **Cancelled**, 1,000 mWIF | matches; no payout |
| Votes | B voted pass on dare 1 | 1 row, `hasVoted` onchain = true |

- **First full sync:** 96,256 blocks (149,421,187 → 149,517,442), 20 events, 2 groups, 3 dares, 6 member joins, 1 vote, in 14.3 s. Later syncs take about 1.2 s.
- **Throttle:** a second call right after a sync returned `throttled`.
- **Concurrency:** 6 simultaneous calls gave exactly 1 `synced` and 5 `busy`.
- **Bug found and fixed:** the first sync stored every timestamp as 1970. This chain's RPC includes `blockTimestamp: 0` on logs, and sync trusted it. Sync now only accepts a positive value and otherwise calls `getBlock`. I reset the cursor and re-synced, and the script now asserts that timestamps are real.

## Price source

- **GeckoTerminal** (`networks/robinhood/token_price/0x5173…4773`) answered: **$0.001267** for mainnet $wif. This is the source in use.
- **DexScreener** also answered when called directly: $0.001271 from the Uniswap v4 WIF/ETH pair on Robinhood Chain.
- The fallback order (GeckoTerminal, then the most liquid Robinhood Chain pair on DexScreener, then `usd: null`) is unit-tested with a mocked `fetch`.
- On testnet, mWIF amounts are shown with the mainnet $wif price, as the spec asks.

## Test results

- **vitest: 46/46 pass** (5 files):
  - **metaHash:** checked against a vector computed independently with `cast abi-encode` + `cast keccak`. Also covers every input changing the hash, salts and invite codes.
  - **Proof hash:** checked against `shasum -a 256`.
  - **Input validation:** ids, usernames, group names, dare text, upload kind/mime/size, storage-path parsing (rejects `..`, mixed case and foreign prefixes), magic bytes, permit and finalize bodies.
  - **Blocklist:** blocks drunk driving, drugs, knives and similar; allows "drink a coke", "crack an egg", "kill it at karaoke", and the names Molly and Rob.
  - **Rate limiter:** the window model and the database wrapper (passes the decision through, fails closed with 503, 429 message).
  - **Sync mapping:** event collection and ordering, exact row mapping (including exact bigint amounts), omitted unknown fields, chunk ranges, batching by key set.
  - **Dare rules:** pass/fail locks, ties after `voteEnd`, Expired, and the button flags.
  - **Price fallback.**
- **SQL rate limiter, live:** 20 parallel hits produced the distinct counts 1–20 with exactly 10 allowed, so the counter is atomic. The window resets on time.
- **Signed upload, live:**
  - A plain `PUT` to the signed URL works with no API key, and the URL can't be used twice.
  - The bucket rejects a disallowed mime type.
  - Download and the public URL work. The test object was deleted.
- **Server-only guard:** I temporarily imported the Supabase admin module into a client component. `next build` failed with "You're importing a module that depends on server-only". Reverted.
- **`npm run build`:** passes. **`npm run lint`:** passes. **`tsc --noEmit`:** clean.
- **Dev server checks:**
  - `/api/sync` 200, `/api/price` 200, `/api/profile/check` 200 (valid and invalid names).
  - `/api/invite/<unknown>` 404.
  - Every auth route returns 401 without a token or with a bad token.
  - `GET /api/permit` 405.
  - `/` and `/i/<code>` return 200, and the brand check finds no forbidden network names on `/`.

Not tested (needs you): any logged-in route with a real Privy token, and the browser transaction flows below.

## Manual browser test (please run these)

You need three Privy logins, because a dare needs a creator, a doer and at least one voter. For example: your email in a normal window (**A**), Google in a private window (**B**), and another email in a second browser (**C**).

1. **Start the app:** `cd web && npm install && npm run dev`, then open http://localhost:3000.
2. **A, log in:** log in as **A** and copy the wallet address. Fund it with `cd contracts && ./script/fund.sh <A address>` (0.001 ETH + 50,000 mWIF).
3. **A, profile:**
   - In **1. Your @name**, type a name and click **Check**. Expect ✅ available. Typing `AB` should give a validation message.
   - Pick a JPG or PNG avatar and click **Save profile**. Expect ✅ Saved and your avatar with a colored ring.
4. **A, create a group:**
   - In **2. Create a group**, type a name and leave **public unchecked** (private). Click **Create group** and confirm.
   - Expect "Group created", then an **Invite link** (`/i/xxxxxxxxxx`). Copy it.
   - **4. Your groups** should list the group with 1 member.
5. **B, set up:** log in as **B**, fund the wallet with `fund.sh`, and set an @name.
6. **B, test the private gate:** in **3. Join a group**, type the new group's id and click **Join public group by id**. Expect ❌ "This group is private: you need its invite link to join."
7. **B, join by invite:**
   - Open the invite link. The preview should show the group name, 1 member, A's @name and avatar, and "private".
   - Click **Join** and confirm. Expect "You're in …".
8. **C, join:** log in as **C**, fund it, set an @name, open the same invite link, and join. The group now has 3 members, the minimum for a dare.
9. **A, test the blocklist:** in **5. Create a dare**, pick the group, type `drive drunk to the store` and click **Create dare**. Expect ❌ "keep it safe and legal".
10. **A, create a dare:**
    - Type `sing at a bus stop`. Set who = B's @name, bounty 100, time 1 hour, vote window 15 min. Click **Create dare**.
    - The first time, expect two wallet prompts: **approve** (once, max allowance), then **createDare**.
    - The bounty shows a ~$ value next to it.
11. **B, accept:** in **7. Waiting on you**, the dare is under "Dares you can accept". Click **Aight bet** and confirm.
12. **B, post proof:**
    - The dare moves to "Your dares needing proof". Choose a photo (JPG/PNG/WebP) or a short MP4 and click **Upload proof**.
    - Expect: Uploading → Hashing → submitProof prompt → ✅ "Proof posted: voting is open".
    - **6. Group feed** shows the photo or clip.
13. **C, vote:** the dare is under "Waiting for your vote". Click **Vote pass**.
    - With 3 members, 1 voter is eligible, so 1 pass vote locks the result.
    - The dare then appears under "Ready to settle".
14. **Anyone, settle:** click **Settle (Passed)**.
    - The feed shows Settled · Passed, paid 95 mWIF and burned 5 mWIF, plus a settled tx link.
    - B's mWIF balance goes up by 95. The group stats show paid out 95 and burned 5.
15. **Optional, fail path:** repeat steps 10–13 with C voting **fail**, then settle as Failed. A gets 90 back and 10 is burned.
16. **Optional, cancel:** A creates a dare with who = anyone, then clicks **Cancel** before anyone accepts. The full bounty comes back.
17. **Your old group 2:** it was created before this phase, so it has no name or invite code yet. To name it, log in with wallet `0xcb47…3c35` and call `/api/groups/register` with its creation tx `0x124edff3…6bce`. The harness only does this right after creating a group, so for now that is a manual API call.

If anything fails, the section shows the decoded contract error (for example `GroupTooSmall` or `NotTarget`) or the API's message. Please paste it to me.

## Concerns

1. **Sync only runs when something calls it:** after each transaction and on register. A transaction sent outside the app (cast, the explorer) only appears after the next `/api/sync`. Add a cron (for example every minute) before launch.
2. **Proof and avatar files are public.** The buckets are public-read. The URLs are hard to guess (a UUID path) and the API only returns them to group members, but anyone holding a URL can open it. If proofs should be private, switch to signed download URLs.
3. **Abandoned uploads are never deleted.** If a user uploads but never finalizes, or finalizes but never calls `submitProof`, the file stays in storage. A cleanup job is needed later.
4. **The blocklist is a speed bump.** It catches obvious phrasing only and is trivial to get around. Real moderation, such as reports or a model check, is a later phase.
5. **Private groups are enforced only by the server.** The contract's `isPublic` is a label: anyone the invite signer signs for can join. This is the same trust model as before. Invite codes can't be rotated or revoked yet.
6. **One database per network.** `sync_state` and every table assume a single chain. Use a separate Supabase project for mainnet; don't point mainnet at this database.
7. **The vote button can be wrong in one rare case.** `canVote` uses join time ≤ proof time. If someone joins in the same block as the proof but after it, the contract's join sequence check rejects their vote, and the API can't see that sequence number. Simulation catches it before anything is sent, so the only effect is a button that shouldn't be there.
8. **Linked wallets are cached for 30 s per user.** Unlinking a wallet in Privy takes up to 30 s to take effect on the server. The code also uses Privy's `users()._get` (an underscore method), as in 3a.
9. **IP rate limits trust `x-forwarded-for`.** That is fine behind Vercel or another trusted proxy, but the header can be spoofed when the server is exposed directly.
10. **Proof finalize loads the whole file into memory,** up to 50 MB per request, to hash it. Fine for now; stream it if traffic grows.
11. **Everything uses the public RPC.** Membership checks on routes, sync and receipts all go through the public, rate-limited testnet RPC. Use a dedicated RPC before launch.
12. **HEIC proofs don't show in most browsers.** They upload and hash fine, but only Safari displays HEIC in an `<img>`. Convert on upload in 3c-2, or keep the type and show a download link instead.
13. **Approval is for the maximum amount, as specified.** The escrow can then move any of the user's mWIF/$wif, but only through `createDare`, which is called by the user.
14. **Dependency changes:** `@types/node` 20 → 24 (vitest 5 requires it; we run Node 24). The tsconfig target moved from ES2017 to ES2020, which allows bigint literals.
