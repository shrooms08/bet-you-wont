# BYW web

A Next.js app on the RH Chain testnet (46630), using Privy for login, Supabase for data and storage, and an API that syncs the escrow's onchain state into Postgres.

## Screens (phase 3c-2a)

| Route | What |
|---|---|
| `/` | Routes you: logged out → `/start`; no @name → `/start?step=you`; otherwise → `/home` |
| `/start?step=how\|signin\|you\|wallet\|crew\|first` | Onboarding O1–O6 |
| `/i/<code>` | Invite link. Onboarding with the invite preview on every step. Joins after the wallet step (or right away if you're already set up and have gas), then opens the crew. |
| `/home` | Instagram-style feed: a stories row for everything waiting on you, then proof posts (double-tap 🔥, autoplay clips, inline voting) and open-dare challenge posts, with infinite scroll |
| `/d/<id>` | One dare in every state: open (aight bet), accepted (countdown dial and "post proof" camera), voting, result stamp, cancelled. Read-only for public-crew visitors; private crews return "this dare is private". |
| `/crews` | Your crews; start a group; join with a code |
| `/g/<id>` | A crew's dare board: inline aight bet / it counts / nah / settle / cancel / post proof |
| `/wallet`, `/profile` | Address, balances and QR; your @name, photo and log out |
| `/new` | Create a dare: crew, text, who, bounty, time to do it, voting time. Prefill with `?group=&text=&amount=`. |
| `/dev` | The 3c-1 test harness. **Development only**: a production build returns 404. |
| `/dev/motion` | Motion gallery: cursor, burst, deck, stamp, double tap, toast states, count-up, tag flip, vote bar, nav pill, stagger and skeleton. **Development only.** |

- **Design tokens:** in [`src/app/theme.css`](src/app/theme.css) (harmony A, "complementary"), exposed to Tailwind v4 through `@theme`. Swapping in another harmony means adding one more `[data-harmony]` block.
- **UI components:** in `src/components/ui/`.
- **Shared transaction logic:** in `src/hooks/` (`useByw`, `useActions`).
- **Motion (3c-2m):** presets live in [`src/lib/motion.ts`](src/lib/motion.ts) (springs, durations, stagger, the reduced-motion switch). `<FxLayer/>` in the root layout owns the particle canvas, the pixel cursor and the dot spotlight. Reusable pieces are in `src/components/motion/`. `/dev/motion` (development only) demos everything. Under `prefers-reduced-motion` there's no cursor, spotlight, particles or springs; only short fades remain.
- **Mock mode:** add `?mock=1` to any app URL in `npm run dev` to render it with fixture data and a fake logged-in user, with no Privy login. Variants: `?mock=empty` and `?mock=external` (external wallet on the wrong network). Production builds ignore it.

## Run locally

```bash
cd web
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run dev                  # http://localhost:3000
```

The database schema is in [`../supabase/migrations/001_init.sql`](../supabase/migrations/001_init.sql). To set it up, paste it into Supabase > SQL Editor and click Run. It is safe to run again.

`.env.local` (gitignored, never commit it):

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy dashboard (public) |
| `NEXT_PUBLIC_NETWORK` | `testnet` (mainnet has no escrow yet) |
| `PRIVY_APP_SECRET` | Privy dashboard → App settings. Server-only. |
| `INVITE_SIGNER_PRIVATE_KEY` | same value as `contracts/.env`; must be `escrow.inviteSigner()`. Server-only. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key `sb_publishable_…` (public; RLS blocks it from every table, and the app does not use it yet) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key `sb_secret_…`. Server-only: used only under `src/server/`, which imports `server-only`, so a client import fails the build. |

Test wallets need testnet ETH for gas (gas is not sponsored). From `contracts/`:

```bash
./script/fund.sh <address> [eth=0.001] [mwif=50000]
```

## Scripts

- `npm run dev`, `npm run build`, `npm run lint`
- `npm test`: vitest unit tests, in `src/server/*.test.ts`
- `npm run verify-sync`: a read-only check that Supabase matches the chain. Run `set -a; source .env.local; set +a` first.
- `npm run sync-abi`: regenerates `src/abi/*` from `../contracts`
- `node scripts/motion-check.mjs video|perf`: records the O1 deck and the `/dev/motion` clips into `../design/screens/3c2m/` (needs `npm run dev`), or logs long tasks during the O1 transition at 4× CPU throttle (needs `next start -p 3001`).
- `node scripts/capture-check.mjs [--upload] [--webm]`: with `npm run dev` running, uses a fake camera to take one photo and one 3-second clip in the real proof camera, then checks the files (type, magic bytes, size, the burned-in receipt, duration, poster). `--upload` also PUTs them to the proofs bucket and confirms a PNG is rejected. Run `set -a; source .env.local; set +a` first.
- `node scripts/screenshots.mjs`: with `npm run dev` running, screenshots every screen at 390×844 @2x and 1440×900 into `../design/screens/3c2a/`. It also checks for horizontal scroll, the bottom nav covering content, and "robinhood" anywhere in the UI.

## API

All writes require `Authorization: Bearer <privy access token>`. A request acts as the wallet in `X-Wallet-Address`, which must be linked to the Privy user. If the header is missing, the request uses the user's only wallet, or their embedded wallet if they have several.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/sync` | public | Pulls new escrow events into Supabase. Skipped if the last sync finished under 3 s ago. |
| GET | `/api/price` | public | `{usd, source, fetchedAt}` for $wif. GeckoTerminal first, then DexScreener. Cached 60 s. |
| GET | `/api/profile/check?username=` | public, 30/min/IP | Checks whether an @name is available. |
| GET | `/api/invite/<code>` | public, 60/min/IP | Invite preview: group name, member count, creator, public flag. |
| POST | `/api/upload-url` | auth, 30/h | Takes `{kind, mime, size}`. Returns a signed upload URL for `<kind>/<wallet>/<uuid>.<ext>`. |
| POST | `/api/profile` | auth, 20/h | Takes `{username, avatarPath?}`. Creates or updates your profile; a new profile gets a ring color. |
| GET | `/api/me` | auth | Your profile, plus your groups with member and live-dare counts. |
| POST | `/api/groups/register` | auth, 20/h | Takes `{txHash, name}` after `createGroup`. Names the group and issues an invite code. Creator only. |
| POST | `/api/permit` | auth, 10/h | Takes `{groupId, inviteCode?}`. Signs a JoinPermit. Private groups need the invite code. |
| POST | `/api/dares/draft` | auth, members, 30/h | Takes `{groupId, text}`. Stores the dare text and returns the `metaHash` to pass to `createDare`. |
| POST | `/api/proofs/session` | auth, doer only, 30/h | Takes `{dareId}`. Starts a 15-minute capture session `{sessionId, code}`; the code is burned into the capture. |
| POST | `/api/proofs/finalize` | auth, doer only, 20/h | Takes `{dareId, storagePath, sessionId, kind, capturedAt, durationMs?, posterPath?}`. Requires a valid session. Accepts only a JPEG photo or an MP4/WebM clip (with a JPEG poster). Returns the sha256 `proofHash` for `submitProof`. |
| GET | `/api/dares/<id>` | auth | Full dare, proof, reactions, voters and your flags. Read-only for public crews; 404 for private crews. |
| GET | `/api/feed?cursor=` | auth | Your crews plus the public crew, newest activity first, 10 per page. Proof posts and open-dare challenge posts. |
| POST | `/api/reactions` | auth, 120/h | Takes `{dareId}`. Toggles your 🔥; returns `{reacted, count}`. |
| GET | `/api/groups/<id>/feed` | auth, members only | The group, its members, stats, and dares, with the buttons each one shows you. |
| GET | `/api/home` | auth | "Waiting on you": dares to accept, vote on, prove, or settle, plus your groups. |
| GET | `/api/groups/<id>/public` | public, 60/min/IP | Preview of a public group (name, member count, open and voting dares, 5 avatars). Private groups return 404. |

## Layout

- `src/server/`: server-only code.
  - `auth`: Privy token and linked wallets
  - `supabase`: the admin client
  - `rateLimit`: a database-backed fixed window
  - `chain`: viem reads
  - `signer`: JoinPermit signing
  - `sync`, `syncMap`: chain → database
  - `dareRules`: copies the contract's resolve and vote rules
  - `validation`: zod
  - `moderation`: the dare-text blocklist
  - `media`: upload rules and magic bytes
  - `hashing`
  - `price`
  - `queries`, `dareView`
- `src/app/api/*`: the routes above.
- `src/components/{ui,app,screens,onboarding,tx}`: the app UI. `src/components/harness/*` is the `/dev` harness.
- `src/app/providers.tsx`: PrivyProvider → QueryClientProvider → WagmiProvider.
- `src/lib/*`: chain, contracts, wagmi, errors, formatting, plain-language errors, image resize, types, and the mock fixtures. These are shared by client and server and hold no secrets.
- `src/abi/*`: generated by `npm run sync-abi`. The copies are committed so the app builds without the contracts folder.
