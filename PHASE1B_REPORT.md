# BYW Phase 1b report: signed join permits, no-proof refund, witness rule

Phase 1b changes are in commit `3cecf6e` "Phase 1b: signed join permits, no-proof refund, witness rule". It follows `eab3e60` "Add phase 1 report". Nothing was deployed, no real keys were created or used, and no transactions were sent. The tests and the fork test use hard-coded test-only signer keys, in local simulation only.

## What changed

1. **Join permits replace invite codes.**
   - `createGroup(bool isPublic)`. `isPublic` is now only a label.
   - `joinGroup(groupId, deadline, signature)` checks an EIP-712 `JoinPermit(uint256 groupId,address account,uint256 deadline)` signed by `inviteSigner`, with domain `"BYWEscrow"` / `"1"`.
   - New functions: `setInviteSigner` (onlyOwner, rejects zero) and `joinPermitDigest`.
   - The constructor is now `(token, inviteSigner)` and rejects zero for either.
   - Removed: `inviteHash`, `setInviteHash`, `InviteHashUpdated`.
2. **No burn when no proof is posted.**
   - New `enum Outcome { None, Passed, Failed, Expired }` replaces the `passed` bool.
   - Expired pays the creator 100% and burns nothing.
   - `DareSettled` and `resolvable` now carry an `Outcome`.
3. **Witness rule.**
   - `createDare` reverts with `GroupTooSmall` below 3 members.
   - `creatorVotes` is gone; the creator never votes.
   - `ProofSubmitted` no longer has a `creatorVotes` field.
4. **Supporting changes.**
   - `src/mocks/MockWIF.sol` ("Mock World is Flat" / mWIF) is shared by the tests and the deploy script.
   - The deploy script reads `INVITE_SIGNER_ADDRESS` and supports `DEPLOY_MOCK_WIF=true`. It was not run.
   - `.env.example` is updated.
   - `abi/BYWEscrow.json` and `abi/MockWIF.json` are exported by `script/export-abi.sh`.
   - The README is rewritten.

All phase 1 safety properties still hold:
- no tx.origin or EOA checks
- pause only blocks `createGroup` and `createDare`
- no owner path to escrowed funds (but see concern 1)
- checks-effects-interactions
- `nonReentrant`
- custom errors
- NatSpec on every external function
- the join-order voter snapshot

## Tests

**79 passed, 0 failed, 0 skipped** (`forge test -vv`).

| Suite | Tests | Result |
|---|---|---|
| `BYWEscrowTest` (unit) | 68 | all pass |
| `BYWEscrowFuzzTest` (1,000 runs each) | 7 | all pass |
| `BYWEscrowInvariantTest` (256 runs × 128 depth = 32,768 calls each) | 3 | all pass |
| `BYWEscrowForkTest` | 1 | pass (live run below; without `ROBINHOOD_RPC_URL` it returns early and reports as passed) |

**Permit tests.** Every requested case is covered:
- a valid permit joins
- an expired permit reverts, and joining at the exact deadline works
- a non-signer's signature reverts
- A's permit submitted by B reverts
- reusing a permit reverts with `AlreadyMember`
- after rotation, old-signer permits revert and new-signer ones work
- `setInviteSigner` is onlyOwner and rejects zero; the signer itself has no owner power
- the constructor rejects a zero signer
- joining works while paused
- `joinPermitDigest` equals an independently computed digest, plus a fuzzed version of that check

Extra permit tests:
- a permit for another group reverts
- a permit whose deadline was altered reverts
- a permit signed for a different escrow address reverts (domain binding)
- malformed signatures revert with OZ's ECDSA errors
- a "public" group still needs a permit
- a fuzzed random signing key always reverts

**Witness rule.** Groups of 1 and 2 revert with `GroupTooSmall`; a group of 3 works. The creator can't vote even in the smallest group.

**Expired.** The creator gets exactly 100% back, totalSupply is unchanged, the escrow ends at 0, the outcome is `Expired`, and it can't be settled at exactly the deadline.

**Updated and kept from phase 1:**
- pass and fail paths
- early locks with eligible = 4 (group of 6)
- tie and zero votes at voteEnd
- a member who joins after proof, or in the same block, cannot vote
- contract-wallet and 7702-designator flows, now joining via permits issued to code-bearing addresses
- pause behaviour
- all revert cases

**Fuzz.**
- `payout + burn == amount` for Passed and Failed, up to the 5M hard cap.
- Expired: `payout == amount` and `burn == 0` for random amounts, durations and lateness.
- The outcome rules match an independent model for group sizes 3 to 6.

**Invariants.**
- The escrow's token balance equals the sum of bounties in Open, Accepted and Voting.
- The drop in totalSupply equals the burns from settles. The handler also checks that Expired settles burn 0 and voted settles burn more than 0.
- Votes never exceed `eligible`, and `eligible` is at least 1.
- `resolvable()` always agrees with what `settle` does.

The handler joins members with signed permits. Doers ghost a third of the time, with occasional jumps of more than 7 days, so the Expired path gets exercised. Sampled seeds show 1 to 7 expiries per run.

## Fork test

**PASS on the first try** against `https://rpc.mainnet.chain.robinhood.com`, forking chain 4663 at block 107,422,705. The flow used the new constructor with a test signer: permit joins for the doer and the voter, then a 10,000 $wif PASS flow against the real token.

| | |
|---|---|
| totalSupply before | 999,997,630.616945024078201546 |
| totalSupply after | 999,997,130.616945024078201546 |
| Burned | exactly 500 $wif (5%) |
| Doer received | 9,500 $wif |
| Escrow balance after | 0 |
| `0x…dEaD` balance | unchanged |

## Gas (median, `forge test --gas-report`)

| Function | Phase 1b | Phase 1 | Change |
|---|---|---|---|
| `createGroup` | 116,298 | 138,993 | −22,695 (no `inviteHash` slot) |
| `joinGroup` | 59,798 | 54,484 | +5,314 (EIP-712 hash + ecrecover) |
| `createDare` | 186,722 | 184,527 | +2,195 (member-count read for the witness rule) |
| `acceptDare` | 77,969 | 77,991 | ≈ |
| `submitProof` | 66,648 | 67,041 | ≈ |
| `vote` | 61,002 | 61,047 | ≈ |
| `settle` | 56,445 | 57,850 | ≈. Max 75,359 (the burn path); Expired skips the burn call |
| Deployment | 2,560,319 gas / 12,579 bytes | 2,100,888 / 9,573 | EIP712 + ECDSA |

## Coverage (`forge coverage`)

`src/BYWEscrow.sol` has **100% coverage** on every measure:

| Measure | Covered |
|---|---|
| Lines | 145 / 145 |
| Statements | 190 / 190 |
| Branches | 40 / 40 |
| Functions | 23 / 23 |

`src/mocks/MockWIF.sol` is also at 100%. There was no stack-too-deep error.

## Ambiguity decisions

1. **Malformed signatures revert with OZ's errors.** You specified `ECDSA.recover`, so bad-length, zero or high-s signatures revert with `ECDSAInvalidSignatureLength`, `ECDSAInvalidSignature` or `ECDSAInvalidSignatureS`, not `InvalidPermitSigner`. A well-formed signature from the wrong key reverts with `InvalidPermitSigner`. All of these are custom errors.
2. **`joinGroup` check order:** `GroupNotFound`, then `PermitExpired`, then `AlreadyMember`, then the signature check. The cheap checks run first, so reusing a permit reports `AlreadyMember` as you asked.
3. **No permit nonce.** Membership is permanent, so a permit is single-use by construction. The only way to revoke an unused, unexpired permit is to rotate the signer, which revokes all of them.
4. **`resolvable` returns `(false, None)` when it can't settle.** That covers dares not yet resolvable, already settled, cancelled, or nonexistent. Phase 1's "current leaning" is gone. `settle` and `resolvable` now share one internal `_resolve`, so they can't disagree; the invariant handler checks this too. Read a settled dare's result from `getDare(id).outcome`.
5. **Expired skips the `burn` call** (`if (burned != 0)`) rather than calling `burn(0)`.
6. **The constructor emits `InviteSignerUpdated(address(0), signer)`**, so indexers can see the initial signer without reading storage.
7. **The witness rule is checked only in `createDare`, as specified.** Members can't leave, so the group still has 3 or more members at proof time, and `eligible = membersAtProof - 2` is at least 1.
8. **The `joinedAt <= proofAt` check is kept** next to the join-order check. It is redundant but harmless.
9. **One mock token.** The test-only mock in `test/mocks/` is removed. Tests and the deploy script share `src/mocks/MockWIF.sol`, which avoids two `MockWIF` artifacts and keeps the ABI export path unambiguous.
   - It has **no public mint**: the full supply goes to `initialHolder` in the constructor, and tests distribute from that.
   - For a testnet faucet, the deployer has to hand out mWIF, or a mint function would need adding.
10. **Deploy script safety.**
    - `DEPLOY_MOCK_WIF` defaults to false.
    - The script refuses the mock on chain 4663.
    - It still requires `WIF_ADDRESS` to have code when not using the mock.
11. **Extras.**
    - Public `MIN_GROUP_SIZE = 3` constant.
    - The `Group` struct dropped `inviteHash` and now fits in one storage slot.
    - `script/export-abi.sh` regenerates `abi/`, and `abi/` is committed for the web app.

## New concerns

1. **The owner now has indirect influence over outcomes.** `setInviteSigner` lets the owner install any key, including their own, then add wallets to groups before proof and swing votes. That moves bounties between doer and creator within the 95/5 and 90/10 splits. There is still no direct owner path to escrowed funds, but the guarantee is weaker than phase 1's "the owner can only pause and cap bounties". **Make the owner a multisig**, and consider a timelock on `setInviteSigner`.
2. **The signer key is a hot backend key with the same power.** If it leaks, rotate it immediately. Rotation also kills legitimate pending invites. Use KMS/HSM signing, short deadlines (minutes), and rate limits per group. Watch `MemberJoined` volume.
3. **Joins depend on the backend being up.** If the signing service is down, nobody can join a group. Existing dares are unaffected.
4. **Three-person groups have one judge.** With exactly 3 members, the single witness decides alone: their pass vote, or their silence, passes the dare. A doer and witness who are friends can easily collude against the creator. Consider showing the voter count in the UI, or a higher minimum for large bounties.
5. **Doers can dodge the burn by ghosting.** A doer who expects a fail can skip proof, which leads to Expired: the creator gets 100% back and nothing burns. A posted-proof fail would have burned 10%. The creator comes out ahead, so this isn't an exploit, but expect fewer burns than the 10% fail rate suggests. Accept-and-ghost griefing now costs the creator only time (up to 7 days of locked funds), not tokens.
6. **Sybil voting remains.** Joining is now gated by backend policy instead of a leakable code, so how resistant BYW is to fake accounts depends entirely on who the backend agrees to sign for.
7. **Lint noise.** Forge lint flags five `erc20-unchecked-transfer` warnings, all in the test file (`wif.transfer` on the mock, which reverts on failure). The contract itself only has the expected `block-timestamp` notes.
8. **The deploy script is untested.** It compiles but was not run, as instructed. Do the first real run on testnet (chain 46630) with `DEPLOY_MOCK_WIF=true`, which also covers phase 1's concern about Cancun opcodes.

Phase 1 concerns that are now resolved:
- invite codes visible on-chain (codes are gone)
- the two-person creator-as-sole-judge problem (the creator never votes, and groups need 3 members)
- the 10% burn from accept-and-ghost griefing (Expired refunds 100%)

## Not done (as instructed)

- No deployment and no transactions.
- No `.env`; only `.env.example`.
- The deploy script was not run.
- `VERIFY.md` was left untracked.
