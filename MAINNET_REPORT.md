# Mainnet launch report

Bet You Won't now runs on **Robinhood Chain mainnet** (chain ID 4663). The escrow was deployed on 2026-11-07 against the real $wif token. The testnet site is retired: the one Vercel project now builds with `NEXT_PUBLIC_NETWORK=mainnet`.

## Addresses

| | Address |
|---|---|
| BYWEscrow | [`0xc8A4e1A956F9AA884D962346123FdC9554Ce713E`](https://robinhoodchain.blockscout.com/address/0xc8A4e1A956F9AA884D962346123FdC9554Ce713E) |
| $wif token (World is Flat, `WIF`, 18 decimals) | [`0x5173b8eA6923c2d40267890D45C46a3480954773`](https://robinhoodchain.blockscout.com/address/0x5173b8eA6923c2d40267890D45C46a3480954773) |
| Owner / deployer | `0x0DAC29759b70D9a0d60A95bf4A8BC1c4Ec9d1779` |
| Invite signer | `0xa62937A20FBDBa3513d60619d11f28562aa081bf` |
| Explorer | https://robinhoodchain.blockscout.com |
| Public RPC | https://rpc.mainnet.chain.robinhood.com |

The escrow address is the same as the testnet MockWIF address, because the same deployer sent its first transaction (nonce 0) on each chain. The two contracts are unrelated.

The full record is in `contracts/deployments/mainnet.json`.

## Transactions

| Step | Tx | Block | Gas used | Gas price | Paid |
|---|---|---|---|---|---|
| Deploy BYWEscrow | [`0x3831…9137`](https://robinhoodchain.blockscout.com/tx/0x3831098b050c75a944b47d8d42870c284455ec0fb963dea98ccd5dd370db9137) | 108275295 | 2,560,319 | 0.020038 gwei | 0.0000513 ETH |
| `createGroup(true)` → group 1 | [`0x7cb6…c307`](https://robinhoodchain.blockscout.com/tx/0x7cb61c4e08688d3117200b2fa1e69cdf027c3e70cc56e1658c3c6d4ef7b3c307) | 108276771 | 116,310 | 0.020068 gwei | 0.0000023 ETH |
| **Total** | | | | | **0.0000537 ETH (≈ $0.12 at $2,245/ETH)** |

- **Before launch:** the estimate was 0.000054 ETH, the deployer held 0.00045 ETH, and 0.000396 ETH is left.
- **No L1 data fee:** the L1 data fee was 0. NodeInterface `gasEstimateComponents` and ArbGasInfo both reported an L1 base fee of 0, so the whole cost was L2 gas.

## Checks after deploy

| Check | Result |
|---|---|
| `token()` | real $wif ✓ |
| `inviteSigner()` | `0xa629…81bf` ✓ |
| `owner()` | deployer ✓ |
| `maxBounty()` | 500,000e18 ✓ |
| `paused()` | false ✓ |

The deploy script refuses to run when the chain ID is not 4663 or when `DEPLOY_MOCK_WIF` is true.

## Source verification

- **Sourcify: exact match** ([repo](https://repo.sourcify.dev/4663/0xc8A4e1A956F9AA884D962346123FdC9554Ce713E)).
- **Blockscout: not submitted.** The explorer's Cloudflare challenge blocks API clients such as `forge verify-contract`. To verify there, use Blockscout's web UI (Verify & publish, via Sourcify or standard JSON input). Blockscout may also import the Sourcify match on its own.

## Public wifie

- **Group:** onchain **group 1**, public, created by the deployer.
- **Database row:** stored as **"world is flat"** with a fresh invite code. Sync only updates onchain columns, so the stored name stays.
- **Member:** the deployer is member 1 (from the `createGroup` event).
- **Env:** `NEXT_PUBLIC_PUBLIC_GROUP_ID=1`.

## Supabase: backup, wipe, re-point

The existing Supabase project is now the mainnet database.

- **Backup:** every table's rows and the storage object paths were written to `backups/testnet-2026-11-07/`. The folder is gitignored and stays on the local machine only.
- **Wipe:** all testnet rows and both storage buckets were cleared. The table shows the counts.
- **Re-point:** `sync_state.last_block` was set to 108275294 (deploy block − 1) with the lock cleared. The public wifie row was inserted, and sync then caught up to the chain head. `verify-sync` passes every check against the chain.

| Table / bucket | Before wipe | After wipe | After mainnet sync |
|---|---|---|---|
| votes | 3 | 0 | 0 |
| reactions | 0 | 0 | 0 |
| proofs | 2 | 0 | 0 |
| proof_sessions | 2 | 0 | 0 |
| dares | 5 | 0 | 0 |
| dare_drafts | 2 | 0 | 0 |
| group_members | 9 | 0 | 1 |
| groups | 3 | 0 | 1 |
| user_stats | 6 | 0 | 0 |
| streak_freezes | 0 | 0 | 0 |
| rate_limits | 15 | 0 | 0 |
| profiles | 3 | 0 | 0 |
| storage: proofs | 2 objects | 0 | 0 |
| storage: avatars | 3 objects | 0 | 0 |

Testnet profiles were wiped, so testers sign up again on mainnet. Their wallet addresses stay the same, but each wallet needs mainnet ETH and $wif.

## App changes

- **Network config:** `NEXT_PUBLIC_NETWORK=mainnet` selects the mainnet escrow, deploy block and Blockscout explorer links. The data is bundled from `contracts/deployments/mainnet.json` by `npm run sync-abi`.
- **Server RPC (mainnet only):** a viem fallback tries `MAINNET_RPC_QUICKNODE`, then `MAINNET_RPC_GETBLOCK`, then the public RPC.
  - Both private URLs are read only in server-only modules and never use `NEXT_PUBLIC_`.
  - Error logs strip them.
  - Testnet keeps its public RPC.
  - The browser and Privy always use the public RPC.
- **Log limits:** GetBlock rejects 5,000-block `eth_getLogs` ranges and QuickNode allows up to 10,000. If QuickNode fails, sync falls through to the public RPC.
- **Labels:** on mainnet the token shows as plain "$wif", and the wallet screen shows "buy $wif on Pons" with a note to keep a little ETH for gas. Testnet-only text is hidden.
- **Bounties:**
  - Quick picks are now 1k / 2.5k / 5k $wif, and custom amounts still work.
  - The big-dare bonus (+25 score) now starts at 5,000 $wif (it was 10,000).
- **Tests:** 142 pass, including the new tests for RPC order and redaction. Lint, tsc and the mainnet build are clean.

## Env changes (Vercel)

| Name | Change | Type |
|---|---|---|
| `NEXT_PUBLIC_NETWORK` | `testnet` → `mainnet` | Config |
| `MAINNET_RPC_QUICKNODE` | added | Secret |
| `MAINNET_RPC_GETBLOCK` | added | Secret |
| `NEXT_PUBLIC_PUBLIC_GROUP_ID` | unchanged, `1` | Config |

Every other variable is unchanged: Privy, the invite signer, Supabase and the app URL.

The local `web/.env.local` was also switched to `NEXT_PUBLIC_NETWORK=mainnet`. A local server running on testnet would sync testnet events into the mainnet database.

## Secrets

- **History scan:** 0 matches for every secret value across all git history and the staged diff. The values were all private keys, the Privy secret, the Supabase service key, and both RPC URLs with their token parts.
- **Build scan:** none of those values appear in the client or server build output, or in the server logs.
