# BYW Escrow contract

`BYWEscrow` is the on-chain escrow behind **Bet You Won't**. It runs on Robinhood Chain (chain ID 4663) and uses the $wif token (`0x5173b8eA6923c2d40267890D45C46a3480954773`).

## What it does

1. Friends form a **group**. A group is either public (anyone can join) or private (you need the invite code).
2. A member creates a **dare** and locks a $wif bounty in the contract. The dare is either aimed at one member (targeted) or open to any member except the creator.
3. A member accepts the dare ("Aight bet"). That member is now the **doer**, and a timer for posting proof starts.
4. The doer posts **proof**: a hash of the off-chain video or photo. Voting opens.
5. The group **votes** pass or fail.
6. Anyone calls **settle**. The contract pays out and burns part of the bounty.
   - **Pass:** the doer gets 95%. The other 5% is burned.
   - **Fail:** the creator gets 90% back. The other 10% is burned.

Burning calls `token.burn()`, so $wif's `totalSupply` actually goes down. Tokens are not sent to `0x…dEaD`.

## State machine

```
            cancelDare (creator, 100% refund)
   Open ───────────────────────────────────▶ Cancelled
    │
    │ acceptDare
    ▼
 Accepted ──── settle after proofDeadline, no proof (FAIL) ────┐
    │                                                           │
    │ submitProof (before proofDeadline)                        ▼
    ▼                                                        Settled
  Voting ───── settle when locked early, or after voteEnd ─────▶
```

| From | To | How |
|---|---|---|
| Open | Cancelled | Creator calls `cancelDare`. The full bounty is refunded and nothing is burned. |
| Open | Accepted | A member calls `acceptDare`. The proof deadline is `now + doDuration`. |
| Accepted | Voting | The doer calls `submitProof` on or before the deadline. Voting ends at `now + voteWindow`. |
| Accepted | Settled (fail) | Anyone calls `settle` after the deadline passes with no proof. |
| Voting | Settled | Anyone calls `settle` once the result is locked or voting has ended. |

Dare limits:
- Bounty: 1 to `maxBounty` $wif. `maxBounty` starts at 500,000.
- `doDuration`: 1 hour to 7 days.
- `voteWindow`: exactly 15 minutes, 1 hour, 6 hours, or 24 hours.

## Who can vote

The voter list is fixed when proof is posted. You can vote if all of the following hold:
- You were a group member when proof was posted. People who join later can never vote on that dare.
- You are not the doer.
- You are not the creator. The one exception: when the creator and doer are the only members, the creator becomes the sole voter (`creatorVotes = true`).

`eligible` is the number of people who can vote: group members minus the doer and the creator, or 1 in the creator-only case.

## Outcome rules

| Rule | Condition |
|---|---|
| Pass locks early | `passVotes * 2 >= eligible` (half or more voted pass) |
| Fail locks early | `failVotes * 2 > eligible` (a strict majority voted fail) |
| After `voteEnd` | Pass if `passVotes >= failVotes`. Ties and zero votes count as **pass**. |
| No proof by deadline | Fail |

A dare can be settled the moment one of the locks applies, before `voteEnd`. Once a result is locked, later votes cannot change it: at most `eligible` people can vote, so the two locks can never both be true.

## Fee and burn split

| Result | Recipient | Paid | Burned |
|---|---|---|---|
| Pass | Doer | 95% | 5% (`PASS_BURN_BPS = 500`) |
| Fail (vote or expiry) | Creator | 90% | 10% (`FAIL_BURN_BPS = 1000`) |
| Cancelled (before accept) | Creator | 100% | 0 |

The contract computes `burned = amount * bps / 10000` and `payout = amount - burned`, so the two always add up to the bounty with no dust left behind. The contract keeps no fee.

## Owner powers

The owner uses `Ownable2Step`, so a new owner must accept the transfer. The owner can only:

1. **Pause and unpause** new groups and new dares (`createGroup` and `createDare`). Everything else keeps working while paused: joining, accepting, posting proof, voting, settling, and cancelling. Escrowed funds can never be frozen.
2. **Set the max bounty** for new dares, anywhere from 1 $wif up to the hard cap of 5,000,000 $wif.

That is all. No function lets the owner, or anyone else, move escrowed tokens except through `cancelDare` and `settle`. The contract also has:
- no upgradeability
- no `receive` or `fallback`, so it rejects ETH
- no fee withdrawal

## Smart-account compatibility

Users run Privy embedded wallets upgraded through EIP-7702, so their addresses have code. The contract never checks `tx.origin`, `extcodesize`, or whether a caller is an EOA. The tests run the full flow from both a forwarding wallet contract and addresses carrying a 7702 delegation designator.

## Frontend views

- `getDare(id)` returns every field of the dare, including `state`. State `None` means the dare does not exist.
- `getGroup(id)` returns the group's data. A zero `creator` means the group does not exist.
- `isMember(groupId, account)` and `joinedAt(groupId, account)` give membership details.
- `hasVoted(dareId, account)` says whether an account has voted.
- `resolvable(dareId)` returns `(canSettle, wouldPass)`. Use it to decide when to show the Settle button.

## Develop

```bash
forge build
forge test -vv
forge test --gas-report
forge coverage

# fork test against mainnet $wif (read-only; it is skipped when the env var is unset)
ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com forge test --match-path test/BYWEscrow.fork.t.sol -vvv
```

## Deploy (not done yet)

```bash
cp .env.example .env   # fill in DEPLOYER_PRIVATE_KEY; .env is gitignored
source .env
forge script script/Deploy.s.sol --rpc-url $ROBINHOOD_RPC_URL --broadcast
```

The deployer becomes the owner. Transfer ownership to a multisig after deploying.
