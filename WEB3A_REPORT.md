# BYW Phase 3a: web app login and onchain group create/join (testnet)

A minimal Next.js test page proving Privy login plus real onchain transactions against the testnet escrow (`0x7ccA…724B`, chain 46630).

Nothing was deployed anywhere. The only chain activity was on testnet: a fund.sh test and `settle(2)`.

Commit: `bde3f09` "Phase 3a: web app login and onchain group create/join on testnet".

## What was built

**Next.js app in `web/`:**
- Next 16.4.5, App Router, TypeScript, Tailwind v4, ESLint, `src/`, npm.
- React 19.3.
- Packages: `@privy-io/react-auth` 3.51.3, `@privy-io/wagmi` 4.0.20, wagmi 2.19.5, viem 2.57.16, `@tanstack/react-query` 5.106, `@privy-io/node` 0.38.0.

**Privy setup:**
- Login methods are email, Google and wallet, with a dark theme.
- An embedded EVM wallet is created for users without wallets.
- `defaultChain` and `supportedChains` are both the active network.
- The wagmi config comes from `@privy-io/wagmi` and includes only the active chain.
- The network is selected by `NEXT_PUBLIC_NETWORK`. Mainnet is config only: the escrow address is `null`, so `escrowAddress()` throws a clear error if mainnet is selected.

**`POST /api/permit`:**
1. Verifies the `Authorization: Bearer` Privy access token server-side. A missing or invalid token gets 401.
2. Loads the user from Privy by `user_id` and builds the list of linked Ethereum wallets. If the requested wallet is not in that list, it returns 403. The client's address is never trusted.
3. Rate-limits in memory to 10 permits per user per hour (429).
4. Makes cheap onchain checks: the signer key must equal `escrow.inviteSigner()` (500 if not), the group must exist (404), and the wallet must not already be a member (409).
5. Signs `JoinPermit{groupId, account, deadline = now + 10 min}` with viem `signTypedData`. The domain is `"BYWEscrow"` / `"1"` / chainId / escrow.
6. Returns `{ groupId, account, deadline, signature }`.

The placeholder secret gives 500 with "PRIVY_APP_SECRET is missing. Paste your Privy app secret into web/.env.local…".

**Test page `/`:**
- Logged out: a Log in button.
- Logged in, it shows:
  - the login method
  - the wallet address, linked to the explorer
  - embedded (Privy) or external (wallet name)
  - the wallet's current chain, with a wrong-network hint
  - ETH and mWIF balances
  - the network name
  - a Log out button
- A zero-ETH notice with a copy-address button.
- **Create group:** sends `createGroup(true)` and shows each step: checking the network, simulating, confirming in the wallet, waiting. It then shows the tx explorer link and the new `groupId`, parsed from `GroupCreated`.
- **Join group:** fetches a permit with the access token, then sends `joinGroup(groupId, deadline, signature)`. It shows the tx link or a decoded error such as `Reverted: AlreadyMember` or `Permit refused (403): …`.
- **Check membership:** calls `isMember(groupId, address)`. The address defaults to the active wallet.

**Wallet routing.** wagmi's active wallet is pinned to the wallet linked to the Privy account (`user.wallet`), through `useSetActiveWallet`:
- Email/Google users transact through the Privy embedded wallet, and Privy shows its own confirmation modal.
- MetaMask/Rabby users transact through that wallet.
- Before every write, `ensureChain()` calls Privy's `wallet.switchChain(46630)`, which prompts the wallet to switch to or add the network.

**Revert decoding.** Every write is simulated with `publicClient.simulateContract` first, so escrow custom errors are decoded by name from the ABI before the wallet prompt. `src/lib/errors.ts` also decodes raw revert data that wallets put inside error messages.

**`contracts/script/fund.sh`:**
- Usage: `./script/fund.sh <address> [eth=0.001] [mwif=50000]`.
- It refuses to run unless `cast chain-id` returns 46630 and the token's symbol is mWIF.
- It validates its inputs, loads `.env` silently, fails if a tx reverts, and prints the two explorer links and the new balances.
- I ran it once with tiny amounts (0.0001 ETH and 10 mWIF to test wallet C), and it worked:
  - [ETH tx](https://explorer.testnet.chain.robinhood.com/tx/0x5e74d4a8d3b707906c1a5d159b29a14b67e0c85e949b667db497fd90234f2621)
  - [mWIF tx](https://explorer.testnet.chain.robinhood.com/tx/0xd69ddd8b84fd9c7a52432a0031ef8a595bf6eea5cba1ce50eaa266ec91f0b218)

## File map

```
web/
  .env.example              names only (committed); .env.local is gitignored, never committed
  scripts/sync-abi.mjs      `npm run sync-abi`: contracts/abi + deployments/testnet.json -> src/abi/*.ts (as const)
  src/abi/                  BYWEscrow.ts, MockWIF.ts, deployments.ts (generated, committed so Vercel can build)
  src/lib/chains.ts         viem defineChain: "Robinhood Chain Testnet" (46630), "Robinhood Chain" (4663)
  src/lib/contracts.ts      NEXT_PUBLIC_NETWORK -> chain, escrow, token, ABIs, explorer link helpers
  src/lib/wagmi.ts          @privy-io/wagmi createConfig (active chain only)
  src/lib/errors.ts         viem/wallet error -> readable string, escrow custom-error decoding
  src/app/providers.tsx     PrivyProvider -> QueryClientProvider -> WagmiProvider
  src/app/layout.tsx        title "Bet You Won't", wraps Providers
  src/app/page.tsx          the test page
  src/app/api/permit/route.ts  POST /api/permit
  README.md                 how to run, env table, layout
contracts/script/fund.sh    testnet funding helper
contracts/deployments/testnet.json  (updated: fund.sh test txs, settle(2), expiredDareId)
```

## Privy server package and docs used

**Server package: `@privy-io/node` (0.38.0).** Privy's current Node docs ("NodeJS setup") use it; `@privy-io/server-auth` is the older SDK. The calls used:
- `new PrivyClient({ appId, appSecret })`
- `privy.utils().auth().verifyAccessToken(token)`, which returns `user_id`
- `privy.users()._get(userId)`, then `linked_accounts`, filtered to `type === 'wallet' && chain_type === 'ethereum'`

I checked all three against the installed typings: `public-api/services/utils/auth.d.ts` and `PrivyUsersService extends Users`.

Docs read, through the docs.privy.io llms-full index:
- React installation, including the Solana peer-dependency note: https://docs.privy.io/basics/react/installation
- Configuring EVM networks (custom chains, `defaultChain`, `supportedChains`): https://docs.privy.io/basics/react/advanced/configuring-evm-networks
- wagmi integration (`createConfig`, `WagmiProvider`, `useSetActiveWallet`): https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi
- Access tokens and server-side verification: https://docs.privy.io/authentication/user-authentication/access-tokens
- NodeJS setup: https://docs.privy.io/basics/nodeJS/setup
- Querying users by ID: https://docs.privy.io/user-management/users/managing-users/querying-users

I also read the Next 16 bundled docs (`node_modules/next/dist/docs`) for route handlers, as `web/AGENTS.md` asks.

## Run it locally

```bash
cd web
npm install
# paste your Privy app secret over PASTE_PRIVY_APP_SECRET_HERE in web/.env.local (already created), then:
npm run dev        # http://localhost:3000
```

To fund a test wallet, run this from `contracts/`: `./script/fund.sh <address>`.

## Verification done

| Check | Result |
|---|---|
| `npm run build` | ✅ no type errors (Turbopack). `/` is static; `/api/permit` is dynamic. |
| `npm run lint` | ✅ clean, with no rules disabled |
| `curl localhost:3000/` | ✅ 200, `<title>Bet You Won't</title>`, brand naming check passes on the HTML |
| `POST /api/permit` with the placeholder secret | ✅ 500 with the "PRIVY_APP_SECRET is missing…" message |
| `POST /api/permit`, no token / bad token (dummy secret set in the process env) | ✅ 401 / 401 |
| `GET /api/permit` | 405 |
| Server signing vs contract | ✅ I signed a JoinPermit exactly as the route does and recovered it against the contract's own `joinPermitDigest()` on testnet. It recovered to `escrow.inviteSigner()` (`0xa629…81bf`), so the domain, types and key are correct. |
| Secrets in the client bundle | ✅ the signer key value, `PRIVY_APP_SECRET` and `INVITE_SIGNER_PRIVATE_KEY` appear 0 times in `.next/static` |
| Secrets in commits | ✅ no `.env*` staged except `.env.example`; 0 matches for any private key value in the staged diff |

**Not done: a real browser login and real wallet transactions.** These need a human, the real `PRIVY_APP_SECRET` (still a placeholder), and the Privy dashboard settings listed below. The code paths are built and type-checked, but email/Google login, the embedded-wallet confirmation modal, and the MetaMask network-add prompt are **untested in a browser**.

## Expired-path result (dare 2)

When I first checked, the chain time was 09:15 UTC and the deadline 09:24:41 UTC. That was close enough to wait, so I waited until the chain's own block timestamp passed it (09:24:57 UTC) and then settled from the deployer.

- Before settling, `resolvable(2)` returned `(true, 3 = Expired)`.
- Tx: [`0xcc800e5e…a327`](https://explorer.testnet.chain.robinhood.com/tx/0xcc800e5eb2a576565d22ba4c5d23ce4eb16f11500c2d2ed87292dc67265da327), block 149,446,636, 47,815 gas, status 1.

| Check | Result |
|---|---|
| Outcome | `Expired` (3). Dare 2 state is `Settled` (4). |
| Creator (deployer) received | exactly **+1,000 mWIF**. The `DareSettled` event shows payout `1000e18` and burned `0`. |
| mWIF totalSupply | **unchanged** (999,999,500) |
| Escrow balance | dropped by exactly 1,000 to 0. Dare 2 was the only live bounty. |
| Other dares | dare 1 is still Settled/Passed and dare 3 is still Cancelled |

Testnet ETH: the deployer now has 0.005359 ETH.

## Concerns

1. **Privy dashboard setup is needed before login works:**
   - Paste `PRIVY_APP_SECRET` into `web/.env.local`.
   - Enable the email, Google and wallet login methods. Google needs OAuth configured in Privy.
   - Add `http://localhost:3000` to the allowed origins.
   - Set the app name to "Bet You Won't". Privy's `appearance` config has no app-name field, so I set `landingHeader` and `loginMessage`; the name in the modal comes from the dashboard.
2. **Custom-chain behaviour in Privy is not verified yet.**
   - The embedded wallet and wagmi both use the public, rate-limited testnet RPC from `defineChain`. Under load, or in production, use a private RPC, proxied server-side so the key isn't exposed through `NEXT_PUBLIC_`.
   - Privy's transaction modal may show the custom chain without USD prices or balance estimates.
   - Its funding UI options may not support this chain.
   - Gas is not sponsored, so a brand-new embedded wallet has 0 ETH. The page warns about this, and fund.sh covers testing.
3. **External wallet network switching** relies on Privy's `wallet.switchChain`, which should fall back to `wallet_addEthereumChain` using the `defineChain` data. This is untested with MetaMask and Rabby.
4. **The rate limit is in memory and per process.** It resets on restart and is not shared across serverless instances. Move it to Redis/KV before any public deploy.
5. **The invite signer key now also lives in the web server's environment.** It's a hot key; for production, use a managed secret or KMS signing. Rotation also needs a server restart, because the `inviteSigner()` match is checked once per process.
6. **fund.sh exposes the key in the process list.** `cast send` has no env-var option for the private key, so the script passes `--private-key "$DEPLOYER_PRIVATE_KEY"` from the sourced env. It is never echoed (no `set -x`), but it is briefly visible in the local process list (`ps`). That's acceptable for a local testnet helper.
7. **Dependency friction:**
   - Turbopack has to resolve Privy's optional Solana peer dependencies even though the app is EVM-only, so they are installed, following Privy's install docs.
   - They're pinned to kit-5-compatible versions (`@solana/kit` ^5.5, `@solana-program/system`/`memo` 0.10.0, `token` 0.9.0), because `@privy-io/node` needs kit ^5 while the latest `@solana-program/*` need kit ^8.5. Expect friction when upgrading.
   - `npm audit` reports 8 moderate transitive advisories from the scaffold and dependencies.
   - npm 11 skipped install scripts for a few native optional packages (bufferutil, keccak); they have JS fallbacks.
8. **Next 16 defaults:**
   - `cacheComponents` is on and forbids route segment config, so the route has no `runtime`/`dynamic` exports. POST handlers are never prerendered, and the Node runtime is the default.
   - `web/AGENTS.md`, created by create-next-app and re-added by `next dev`, is committed.
   - There's a harmless warning about a stray `/Users/minos/package-lock.json` outside the repo.
9. **Brand rule:**
   - No UI text, title or asset uses the restricted name.
   - Chain names are "Robinhood Chain Testnet" / "Robinhood Chain" (renamed after the audit).
   - Explorer link URLs and the RPC URLs still contain the official domain; that's unavoidable, and it isn't displayed as text.
   - The default Next favicon is still in place.
10. **"Login method" is accurate only right after login.** Privy reports `loginMethod` only in the login callback. After a page reload, the page infers it from the linked accounts (google, then email, then wallet), which can differ from the method actually used.
