# BYW Phase 2a: Robinhood Chain testnet deploy and smoke test

Deployed on 2026-11-06 to **Robinhood Chain testnet (chain ID 46630)**. Mainnet was not touched. Every transaction below is a real testnet transaction. Private keys were loaded from `contracts/.env` inside commands only. Keys were never printed and never committed: a scan of the staged diff for every key value found 0 matches.

Machine-readable record: [`contracts/deployments/testnet.json`](contracts/deployments/testnet.json).

## Network

| | |
|---|---|
| Chain ID | `46630`, confirmed with `cast chain-id` |
| RPC | `https://rpc.testnet.chain.robinhood.com` (public) |
| Explorer | https://explorer.testnet.chain.robinhood.com (Blockscout) |
| Gas price observed | 0.01 gwei. The receipts show no L1 data fee on testnet (`gasUsedForL1 = 0`). |

The explorer loads and its API serves this chain. Its latest block matched the RPC to within a few blocks (149,420,853 vs 149,420,863), and it reported the same deployer balance.

## Deployed contracts

| Contract | Address | Verified |
|---|---|---|
| MockWIF ("Mock World is Flat", mWIF, 18 decimals, 1,000,000,000 minted to the deployer) | [`0xc8A4e1A956F9AA884D962346123FdC9554Ce713E`](https://explorer.testnet.chain.robinhood.com/address/0xc8A4e1A956F9AA884D962346123FdC9554Ce713E) | ✅ Pass - Verified |
| BYWEscrow | [`0x7ccA41a329b9bA8e0F50C0711f63A55d8820724B`](https://explorer.testnet.chain.robinhood.com/address/0x7ccA41a329b9bA8e0F50C0711f63A55d8820724B) | ✅ Pass - Verified (on the second submission) |

| Role | Address |
|---|---|
| Deployer and owner | `0x0DAC29759b70D9a0d60A95bf4A8BC1c4Ec9d1779` |
| Invite signer | `0xa62937A20FBDBa3513d60619d11f28562aa081bf` |
| Test wallet A | `0x3B031e43b2710D5D049e465A2d5675C958b659Ce` |
| Test wallet B | `0x43D86C35390f2B1ab9a9bDE01bAE4f2336771078` |
| Test wallet C | `0x4d07c74890D6a5469356C1e5ee20BEb6C517e898` |

Deploy block: 149,421,187 (MockWIF); BYWEscrow followed at 149,421,194.

Checked on-chain after the deploy:
- `escrow.token()` is MockWIF.
- `escrow.inviteSigner()` and `escrow.owner()` are as expected.
- mWIF `totalSupply` is 1e27, all of it held by the deployer.

| Tx | Gas used | Link |
|---|---|---|
| deploy MockWIF | 584,995 | [0xeb0ec795…](https://explorer.testnet.chain.robinhood.com/tx/0xeb0ec7959ea7e967bb7aa70ff7d9c700316a586cd06ff6f005a058d9cc49d719) |
| deploy BYWEscrow | 2,560,319 | [0xdefeaf41…](https://explorer.testnet.chain.robinhood.com/tx/0xdefeaf415b7d158e92a1d2bab099ad82a7fd010441f358c7b270341414c39727) |

## Smoke test (`contracts/script/SmokeTest.s.sol:SmokeTest`)

Each run was simulated first, then broadcast with `--broadcast --slow`. All 13 transactions succeeded (status 1). The run created group **1** and dare **1**.

| Step | Sender | Gas used | Tx |
|---|---|---|---|
| 1. fund A 0.0015 ETH | deployer | 21,000 | [0xfd483a2f…](https://explorer.testnet.chain.robinhood.com/tx/0xfd483a2fce3c586da0a4ddf0f7f724fdbc03692c9a5b64fdeaa539f3f746f2b6) |
| 1. fund B 0.0015 ETH | deployer | 21,000 | [0xd1d7aa4a…](https://explorer.testnet.chain.robinhood.com/tx/0xd1d7aa4a95a7e078a20534f223c649577ae72fb0a2439945d3bd510a44ab56d6) |
| 1. fund C 0.0015 ETH | deployer | 21,000 | [0xdd7fe8b7…](https://explorer.testnet.chain.robinhood.com/tx/0xdd7fe8b71c626a6755be2a335d923b9f345947920a16aaf1fa01665ae4bdd532) |
| 2. `createGroup(true)` → group 1 | deployer | 116,310 | [0x84f15f51…](https://explorer.testnet.chain.robinhood.com/tx/0x84f15f5195079669ce0af6b8d0e25d8b7816da3b5c5ef9c4d7e7e6fbf854a9b9) |
| 3. `joinGroup` with signed permit | A | 59,822 | [0x9e93f78f…](https://explorer.testnet.chain.robinhood.com/tx/0x9e93f78f224c6fbef35e85125853eee6b1d398638dbe347caaf86ec669c67946) |
| 3. `joinGroup` with signed permit | B | 59,822 | [0x65ee2e13…](https://explorer.testnet.chain.robinhood.com/tx/0x65ee2e1328dced66d98412b3efbc61c9aabc650a73d41ac2ca05b6ed01b598d7) |
| 3. `joinGroup` with signed permit | C | 59,822 | [0xaec89a9f…](https://explorer.testnet.chain.robinhood.com/tx/0xaec89a9feaf915063a23545ffe3d6daa12ffb7ab2ae9d58b4c498c7036717505) |
| 4. `approve` 10,000 mWIF | deployer | 46,391 | [0x0e3b86f3…](https://explorer.testnet.chain.robinhood.com/tx/0x0e3b86f3286c68cf23642a3e875c86524d687a5a3ce74247bf9630ac17786939) |
| 4. `createDare` (open, 10,000 mWIF, 1 h, 15 min) → dare 1 | deployer | 185,118 | [0xeef16eed…](https://explorer.testnet.chain.robinhood.com/tx/0xeef16eed27aee05299ae3abbbd728de2a71c640feb4822ac56c2720e18d3f597) |
| 5. `acceptDare(1)` | A | 77,969 | [0xf225ece1…](https://explorer.testnet.chain.robinhood.com/tx/0xf225ece11fb5f44e7961e05f37db5155428d7e7452fb4b3f7d6506f6878616a9) |
| 6. `submitProof(1, keccak256("smoke-proof-1"))` | A | 66,648 | [0x18cbba88…](https://explorer.testnet.chain.robinhood.com/tx/0x18cbba880d929cea6ac1851d9a9c6f23646f051574ddfd851caabd9899e7ca02) |
| 7. `vote(1, pass)`: eligible 2, so 1 vote locks the pass | B | 61,002 | [0x435e0c60…](https://explorer.testnet.chain.robinhood.com/tx/0x435e0c609a08a6a5eeb777e31770be014e82cde371363c9058f32ff68e9ca5dd) |
| 8. `settle(1)` | C | 75,359 | [0x58321656…](https://explorer.testnet.chain.robinhood.com/tx/0x58321656b607d6aad75f5303de4de1d99fd73443583e2c6775660e8c1515ed93) |

### Final assertions

The script's `require`s passed in both simulation and broadcast. I re-checked each one against the live chain with `cast call`:

| Check | Expected | On-chain | |
|---|---|---|---|
| A's mWIF balance | 9,500 | 9,500 (`9500000000000000000000`) | ✅ |
| mWIF totalSupply drop | 500 | 1,000,000,000 → 999,999,500 | ✅ |
| Escrow mWIF balance after dare 1 | 0 | 0 | ✅ |
| Dare 1 state / outcome | Settled / Passed | `4` (Settled) / `1` (Passed) | ✅ |
| Dare 1 eligible voters | 2 | 2 (4 members − doer − creator) | ✅ |

## Refund path (`SmokeTest.s.sol:SmokeTestRefund`, group 1)

| Step | Sender | Gas used | Tx |
|---|---|---|---|
| `approve` 2,000 mWIF | deployer | 46,379 | [0x1c345fdf…](https://explorer.testnet.chain.robinhood.com/tx/0x1c345fdfefd74a84445dfc1ed094f44582799ad3f8b563c62a5359cb91ac05de) |
| `createDare` 1,000 mWIF → **dare 2** | deployer | 172,806 | [0x1e5f5e54…](https://explorer.testnet.chain.robinhood.com/tx/0x1e5f5e547f8a03b76a5c7335a474cca474f843a41acd6f1c76c70b0fd88532fa) |
| `acceptDare(2)` | B | 77,969 | [0xf684079f…](https://explorer.testnet.chain.robinhood.com/tx/0xf684079f7f16d3cf0c66550947669add5105d4984c27c9fe793082d953b9c7f6) |
| `createDare` 1,000 mWIF → **dare 3** | deployer | 150,906 | [0x439aef29…](https://explorer.testnet.chain.robinhood.com/tx/0x439aef29e0ea824329e61136e7a8ee4f5192eb7d837184ba8e487f549a6ed406) |
| `cancelDare(3)` | deployer | 48,525 | [0x7fcedddd…](https://explorer.testnet.chain.robinhood.com/tx/0x7fcedddd273b455f10c2bfe7bb2df24bf56dc57335f1b73ba44c0277fc2149e8) |

**Cancel result:**
- Dare 3 is `Cancelled` (state 5).
- The deployer's mWIF balance was the same before dare 3 was created and after it was cancelled, so exactly 1,000 came back with nothing burned.
- On-chain, the deployer holds 999,989,000 mWIF: 1B, minus dare 1's 10,000, minus dare 2's 1,000.

**Pending dare: id 2.**
- State `Accepted`; doer B (`0x43D8…1078`); bounty 1,000 mWIF, still held by the escrow.
- Proof deadline: 2026-11-06 09:24:41 UTC (unix 1793957081).
- After that time, anyone can call `settle(2)`. It should produce `Expired`: the deployer gets 1,000 mWIF back, nothing is burned, and the escrow balance drops to 0.

## ETH spent

| Account | ETH balance |
|---|---|
| Deployer, start | 0.010000 |
| Deployer, now | **0.005460** (0.0045 sent to A/B/C, about 0.00004 in fees) |
| A / B / C, now | 0.001498 / 0.001498 / 0.001499 |

Total fees across all 20 transactions came to about 0.00005 ETH. Deploying both contracts cost about 0.000031 ETH.

## Problems and notes

1. **BYWEscrow verification needed a second submission.** The first `forge verify-contract --watch` returned `Unknown UID`, and the API showed the contract as unverified. Resubmitting the same command returned `Pass - Verified`. MockWIF verified on the first try.
2. **No reverts.** Every step succeeded on the first broadcast.
3. **One aborted command, nothing sent.** A shell quirk on my side (zsh treated `======` as a command lookup) aborted the first broadcast attempt of the refund script before it ran. I confirmed `dareCount` was still 1, so nothing had been sent, then broadcast it normally.
4. **Mainnet fees will be higher.** Testnet receipts show no L1 data fee, and mainnet will add one. Use the gas numbers above as L2 execution gas only.
5. **New `.env` entries.** `.env` now also holds `TEST_A/B/C_PRIVATE_KEY/ADDRESS` (throwaway testnet wallets) and the public `MOCK_WIF_ADDRESS` / `BYW_ESCROW_ADDRESS`. `.env.example` lists every variable the scripts read, all with empty placeholders.
6. **The test wallets still hold about 0.0015 testnet ETH each.** A also holds 9,500 mWIF. They can be reused for phase 2b UI testing.
