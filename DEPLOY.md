# Deploying BYW (web) to Vercel

The web app is in `web/`. It runs on **Robinhood Chain mainnet** (chain 4663, `NEXT_PUBLIC_NETWORK=mainnet`); `testnet` still works for local development. Contract ABIs and both deployments (`contracts/deployments/{testnet,mainnet}.json`) are bundled in `web/src/abi/`, so the build never reads `../contracts`. If the contracts or deployments change, run `npm run sync-abi` locally and commit the result.

| Mainnet | |
|---|---|
| BYWEscrow (v2) | `0xA23143a995898DA008700921da498bdA5dFF8811` (deploy block 108389945, Sourcify exact match) |
| BYWEscrow (v1, paused) | `0xc8A4e1A956F9AA884D962346123FdC9554Ce713E` (retired after the audit; held no bounties) |
| $wif token | `0x5173b8eA6923c2d40267890D45C46a3480954773` |
| Public wifie | group 1, "world is flat" |
| Explorer | https://robinhoodchain.blockscout.com |

## Vercel project settings

| Setting | Value |
|---|---|
| Root Directory | `web` |
| Framework preset | Next.js (auto-detected) |
| Install / Build command | defaults (`npm install` / `next build`) |
| Function region | `lhr1` (London, next to the Supabase project), set in `web/vercel.json` |
| Node.js | 22 or 24 |

## Environment variables

Add these in **Project → Settings → Environment Variables**. Never commit real values.

- **Public:** inlined into the browser bundle at build time. Changing one needs a redeploy.
- **Secret:** read only on the server.

| Name | Public / secret | Where the value comes from | Example format |
|---|---|---|---|
| `NEXT_PUBLIC_NETWORK` | public | `mainnet` in production (`testnet` for local testnet work) | `mainnet` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | public | Privy dashboard → your app → Settings → App ID | short id string, e.g. `cm…` (25 chars) |
| `PRIVY_APP_SECRET` | **secret** | Privy dashboard → your app → Settings → App secret | long random string (copy exactly) |
| `INVITE_SIGNER_PRIVATE_KEY` | **secret** | The key of the escrow's `inviteSigner` address (the same value as `INVITE_SIGNER_PRIVATE_KEY` in `contracts/.env`). It signs join permits. | `0x` + 64 hex chars |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase → Project Settings → API → Project URL | `https://abcdefghijklmnop.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | Supabase → Project Settings → API Keys → secret key | `sb_secret_xxxxxxxx…` |
| `NEXT_PUBLIC_PUBLIC_GROUP_ID` | public | The onchain id of the public "world is flat" wifie: `1` on mainnet (also 1 on testnet) | `1` |
| `MAINNET_RPC_QUICKNODE` | **secret** | QuickNode dashboard → your Robinhood Chain mainnet endpoint → HTTP Provider URL. The server's first-choice RPC. The URL contains an API token: server-only, never `NEXT_PUBLIC_`. | `https://<name>.robinhood-mainnet.quiknode.pro/<token>/` |
| `MAINNET_RPC_GETBLOCK` | **secret** | GetBlock dashboard → Robinhood Chain mainnet endpoint URL. The second-choice RPC (the public RPC is the last fallback). Contains an access token: server-only. | `https://go.getblock.io/<token>` |
| `NEXT_PUBLIC_APP_URL` | public | Your deployed origin, no trailing slash. It is used for absolute link-preview URLs and printed on share cards. If unset, the app falls back to Vercel's production domain. | `https://bet-you-wont.vercel.app` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | public | The contact address on /terms, /privacy, /guidelines and the footer (data deletion requests go here). Falls back to `hello@example.com`. | `hello@yourdomain.com` |
| `ADMIN_WALLETS` | **server-only** | Comma-separated wallet addresses allowed to use `/admin` (review reports, hide/unhide, delete proof files, block profiles, delete a profile's data). Unset = nobody. | `0xabc…,0xdef…` |
| `CRON_SECRET` | **secret** | Any long random string (e.g. `openssl rand -hex 32`). Vercel Cron sends it as `Authorization: Bearer …` to `/api/cron/cleanup` (daily, see `vercel.json`); without it the cleanup refuses to run. | 64 hex chars |

Server RPC order on mainnet: `MAINNET_RPC_QUICKNODE` → `MAINNET_RPC_GETBLOCK` → `https://rpc.mainnet.chain.robinhood.com`. Either private one can be left unset. The browser (wallet, Privy) always uses the public RPC. Error logs strip both private URLs.

`NODE_ENV` is set by Vercel. Don't add it. Dev-only features (`?mock=…` fixtures, `/dev`, the share-card mock) are off in production builds.

## After the first deploy

1. **Privy:** in Dashboard → your app → Settings → Domains / Allowed origins, add the Vercel production domain, and preview domains if you use them. Login fails on any origin that isn't listed.
2. **App URL:** set `NEXT_PUBLIC_APP_URL` to the final domain and redeploy, so link previews and share cards show it.
3. **Supabase:** nothing to change. All three migrations (`supabase/migrations/001–003`) are already applied.
4. **Smoke test:**
   - `/start` loads.
   - `/dev` returns 404.
   - `/api/sync` returns `{"status":"synced"…}`.
   - Paste a public-wifie dare link (`/d/<id>`) into a link-preview checker: it should show the dare card. A private-wifie dare should show the generic BYW image.

## Link previews

- Every page uses `web/public/og-default.png` (1200×630). Regenerate it with `node web/scripts/og-default.mjs`.
- `/d/<id>` for a dare in a **public** wifie uses `/api/og/public/dare/<id>?v=<state>`. That is the 1080×1920 share card, with no login needed, cached per dare state. Any other dare returns 404 there.
- Private-wifie dares get the generic image and text. Their title, bounty and people never appear in a preview.
