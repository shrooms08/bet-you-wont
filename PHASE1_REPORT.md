# BYW Phase 1 report: escrow contract

Commit `56a59f4` "BYW escrow contract with tests", on `master` (the repo's first commit). Nothing was deployed, no keys were created or used, and no transactions were sent.

Toolchain: Foundry 1.7.1, solc 0.8.24 (optimizer on, 200 runs, `evm_version = cancun`), OpenZeppelin Contracts v5.5.0 (the same version $wif is built on), forge-std v1.17.0.

## Tests

**63 passed, 0 failed, 0 skipped** (`forge test -vv`).

| Suite | Tests | Result |
|---|---|---|
| `BYWEscrowTest` (unit) | 55 | all pass |
| `BYWEscrowFuzzTest` (1,000 runs each) | 4 | all pass |
| `BYWEscrowInvariantTest` (256 runs × 128 depth = 32,768 calls each) | 3 | all pass |
| `BYWEscrowForkTest` | 1 | pass (live run below; without `ROBINHOOD_RPC_URL` it returns early and reports as passed) |

Everything on the requested list is covered. Beyond the list:
- A same-block late joiner cannot vote.
- A member who joined after the dare was created but before proof can vote.
- An early pass lock is not undone by later fail votes.
- Concurrent dares in separate groups stay isolated.
- `createDare` without an approval reverts and rolls back.
- Two-step ownership transfer works.
- The contract rejects ETH.
- Every bounty, `doDuration` and `voteWindow` boundary value is tested.

Fuzz and invariant tests:
- `testFuzz_passSplit` and `testFuzz_failSplit`: `payout + burn == amount`, and the escrow ends empty.
- `testFuzz_splitUpToHardCap`: the same split check for any amount up to 5M $wif.
- `testFuzz_outcomeRules`: random group sizes and votes. The settle result always matches an independent implementation of the rules, and the two early locks are never both true.
- Invariants, each checked after every call of a random create / accept / proof / vote / cancel / settle / warp / late-join sequence:
  - the escrow's token balance equals the sum of bounties in Open, Accepted and Voting
  - the drop in totalSupply equals the sum of settle burns
  - votes never exceed `eligible`

## Fork test

**PASS on the first try** against `https://rpc.mainnet.chain.robinhood.com`. It forked chain 4663 at block 107,389,657 and ran one full PASS flow against the real $wif token with a 10,000 $wif bounty.

| | |
|---|---|
| totalSupply before | 999,997,630.616945024078201546 |
| totalSupply after | 999,997,130.616945024078201546 |
| Burned | exactly 500 $wif (5%) |
| Doer received | 9,500 $wif |
| Escrow balance after | 0 |
| `0x…dEaD` balance | unchanged |

## Gas (from `forge test --gas-report`)

| Function | Median | Max |
|---|---|---|
| `createDare` | 184,527 | 207,018 |
| `acceptDare` | 77,991 | 77,991 |
| `submitProof` | 67,041 | 67,054 |
| `vote` | 61,047 | 61,178 |
| `settle` | 57,850 | 74,950 |
| `createGroup` | 138,993 | 139,005 |
| `joinGroup` | 54,484 | 54,484 |
| `cancelDare` | 29,032 | 48,525 |
| Deployment | 2,100,888 gas | 9,573 bytes |

These are L2 execution gas figures. At the 0.02 gwei observed on 4663, `createDare` costs about 3.7e-6 ETH, plus the L1 data fee.

## Coverage (`forge coverage`)

`src/BYWEscrow.sol` has **100% coverage** on every measure:

| Measure | Covered |
|---|---|
| Lines | 149 / 149 |
| Statements | 193 / 193 |
| Branches | 41 / 41 |
| Functions | 21 / 21 |

Coverage ran without hitting stack-too-deep. The deploy script is not exercised by the tests (0%), which is expected.

## Ambiguity decisions

1. **Exact voter snapshot.** The spec's `joinedAt <= proofAt` check has a gap: someone who joins in the same block, right after `submitProof`, has `joinedAt == proofAt`. They would pass the check without being counted in `eligible`, so voters could outnumber `eligible` and break the early-lock math.
   - Fix: each member gets a 1-based join order number (`seq`, packed into the same storage slot as `joinedAt`), and `submitProof` records `membersAtProof`. A vote counts only if `seq <= membersAtProof`.
   - The `joinedAt <= proofAt` check is kept as well. `eligible = memberCount - 2`, with the creator-only fallback, exactly as specified.
2. **`joinGroup` works while paused.** The spec says pausing blocks *only* `createGroup` and `createDare`.
3. **`nonReentrant` on `createDare` and `cancelDare` too**, not just `settle`. It costs nothing meaningful and is the safer choice.
4. **Votes are still accepted after an early lock**, until settle or `voteEnd`. They cannot change a locked result (proven above). Blocking them would add a branch for no benefit.
5. **`resolvable().wouldPass` when it can't settle yet:** for Voting, it returns the current leaning (`passVotes >= failVotes`). For Accepted, it returns `false`, since expiry is a fail.
6. **Unknown ids don't revert in `getDare` and `getGroup`.** They return a zeroed struct: state `None`, or `creator == 0`. Calls that change state revert with `InvalidState`, `NotResolvable`, `NotDareCreator` or `GroupNotFound`.
7. **Open dares never expire.** The creator can cancel at any time before someone accepts.
8. **`createGroup` accepts any `inviteHash`, including 0.** A private group with hash 0 can't be joined until the creator calls `setInviteHash`. A public group's hash is stored but ignored.
9. **Owner = deployer** (`msg.sender`). OZ's default `renounceOwnership` is left enabled. Renouncing while paused would block new dares permanently, but escrowed funds stay withdrawable.
10. **No received-amount check on `safeTransferFrom`.** $wif has no transfer fee and the token address is immutable.
11. **Extras:**
    - `MIN_BOUNTY` (1e18), `BPS_DENOMINATOR`, `MIN_DO_DURATION` and `MAX_DO_DURATION` are public constants.
    - A `joinedAt(groupId, account)` view.
    - The deploy script refuses to run if `WIF_ADDRESS` has no code.

## Concerns (for product and audit review)

1. **Invite codes are visible on-chain.**
   - `joinGroup` sends the code in plain text, so after the first join anyone reading the chain knows it.
   - Short codes can also be brute-forced offline against the public `inviteHash`.
   - Treat private groups as "unlisted", not secret. Use long random codes and rotate them with `setInviteHash`.
   - A stronger design would be a creator-signed invite (EIP-712) or a per-invitee allowlist.
2. **Sybil voting.** Anyone can join a public group with extra wallets before proof and swing votes. Private groups with leaked codes have the same problem. Votes are one per address, with no stake or identity.
3. **Griefing by accept-and-ghost.** Any member can accept an open dare and never post proof. The bounty stays locked for up to 7 days, then fails, and the creator loses 10% to the burn. The griefer pays nothing. Targeted dares avoid this. Possible fixes: refund 100% on no-proof expiry, or require the doer to stake.
4. **Creator incentive in two-person groups.** When the creator is the sole voter, voting fail always gets them 90% back. The doer has to trust the creator.
5. **The rules lean towards pass.** Half the voters lock a pass, ties pass, and silence passes. That is by design, but in large groups with inactive members, the result comes down to the vote window rather than the votes.
6. **Someone has to call settle.** Settle needs a transaction from someone. The app or a keeper should call it so funds don't sit in escrow; `resolvable()` exists for this.
7. **Chain opcode support.** The bytecode targets Cancun (PUSH0, MCOPY). That is fine on ArbOS 20+, and EIP-7702 being live on 4663 implies ArbOS 40+. The fork test ran the bytecode in Foundry's EVM, not on the chain, so confirm with a testnet deploy (chain 46630) first.
8. **No external audit yet.** The contract is small and has 100% branch coverage plus invariants. It will hold user funds, so get an independent review before mainnet.

## Not done (as instructed)

- No deployment.
- No `.env` was created; only `.env.example`.
- No transactions were sent. The fork test is local simulation only.
- `VERIFY.md` (your pre-existing research file) was left untracked and not committed.
- This report was written after the commit, so it is uncommitted.
