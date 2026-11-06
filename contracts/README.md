# BYW Escrow contract

`BYWEscrow` is the on-chain escrow behind **Bet You Won't**. It runs on Robinhood Chain (chain ID 4663) and uses the $wif token (`0x5173b8eA6923c2d40267890D45C46a3480954773`).

## What it does

1. Friends form a **group**. To join, a person needs a join permit signed by the BYW backend (see "Joining a group" below).
2. A member creates a **dare** and locks a $wif bounty in the contract. The dare is either aimed at one member (targeted) or open to any member except the creator. The group must have at least 3 members.
3. A member accepts the dare ("Aight bet"). That member is now the **doer**, and a timer for posting proof starts.
4. The doer posts **proof**: a hash of the off-chain video or photo. Voting opens.
5. The other members **vote** pass or fail. The doer and the creator never vote.
6. Anyone calls **settle**. The contract pays out, and burns part of the bounty when there was a vote.

Burning calls `token.burn()`, so $wif's `totalSupply` actually goes down. Tokens are never sent to `0x…dEaD`.

## Outcomes

| Outcome | When | Recipient | Paid | Burned |
|---|---|---|---|---|
| `Passed` | The group voted it done | Doer | 95% | 5% (`PASS_BURN_BPS = 500`) |
| `Failed` | The group voted it not done | Creator | 90% | 10% (`FAIL_BURN_BPS = 1000`) |
| `Expired` | The doer posted no proof before the deadline | Creator | 100% | 0 |
| (cancelled) | The creator cancelled before anyone accepted | Creator | 100% | 0 |

The contract computes `burned = amount * bps / 10000` and `payout = amount - burned`, so the two always add up to the bounty with no dust left behind. The contract keeps no fee. Each dare stores its `outcome`, which reads `None` until it is settled.

## State machine

```
            cancelDare (creator, 100% refund)
   Open ───────────────────────────────────▶ Cancelled
    │
    │ acceptDare
    ▼
 Accepted ──── settle after proofDeadline, no proof (EXPIRED, 100% refund) ──┐
    │                                                                         │
    │ submitProof (before proofDeadline)                                      ▼
    ▼                                                                      Settled
  Voting ───── settle when locked early, or after voteEnd (PASSED / FAILED) ──▶
```

| From | To | How |
|---|---|---|
| Open | Cancelled | Creator calls `cancelDare`. The full bounty is refunded. |
| Open | Accepted | A member calls `acceptDare`. The proof deadline is `now + doDuration`. |
| Accepted | Voting | The doer calls `submitProof` on or before the deadline. Voting ends at `now + voteWindow`. |
| Accepted | Settled (`Expired`) | Anyone calls `settle` after the deadline with no proof. The creator gets 100% back. |
| Voting | Settled (`Passed`/`Failed`) | Anyone calls `settle` once the result is locked or voting has ended. |

Dare limits:
- Group size: at least 3 members when the dare is created (`MIN_GROUP_SIZE`).
- Bounty: 1 to `maxBounty` $wif. `maxBounty` starts at 500,000.
- `doDuration`: 1 hour to 7 days.
- `voteWindow`: exactly 15 minutes, 1 hour, 6 hours, or 24 hours.

## Joining a group: server-signed EIP-712 permits

There are no invite codes on-chain. When the app decides someone may join a group (for example, they opened a valid invite link), the BYW backend signs a **join permit** for that wallet. The wallet then submits it:

```solidity
joinGroup(uint256 groupId, uint256 deadline, bytes signature)
```

**EIP-712 domain**

| Field | Value |
|---|---|
| `name` | `"BYWEscrow"` |
| `version` | `"1"` |
| `chainId` | the chain the escrow is deployed on (4663 on mainnet) |
| `verifyingContract` | the escrow's address |

**Type string**

```
JoinPermit(uint256 groupId,address account,uint256 deadline)
```

`JOIN_PERMIT_TYPEHASH` is `keccak256` of that string.

The contract checks that:
- the group exists
- `block.timestamp <= deadline`
- the caller is not already a member
- `ECDSA.recover(digest, signature) == inviteSigner`

`account` must equal `msg.sender`, so a permit copied out of someone else's transaction is useless to any other wallet. Membership is permanent, so a permit can only be used once. Rotating the signer instantly invalidates every outstanding permit.

Backend signing (viem):

```ts
const signature = await signer.signTypedData({
  domain: { name: "BYWEscrow", version: "1", chainId: 4663, verifyingContract: ESCROW },
  types: { JoinPermit: [
    { name: "groupId", type: "uint256" },
    { name: "account", type: "address" },
    { name: "deadline", type: "uint256" },
  ] },
  primaryType: "JoinPermit",
  message: { groupId, account, deadline },
});
```

`joinPermitDigest(groupId, account, deadline)` returns the exact digest to sign, so you can check the backend against the contract. Joining works while the contract is paused.

`createGroup(bool isPublic)` stores `isPublic` only as a label for the app (listed or unlisted). It does not change who can join: every join needs a permit.

### Trust note

The invite signer is a backend key with one power: it **decides who can join groups**. It cannot move funds, change outcomes directly, pause the contract, or change any setting.

It still matters. A compromised signer key could add wallets to any group. Those wallets could then accept open dares or vote. Only members who joined before proof was posted count, so stuffing has to happen before proof. This way an attacker could swing pass/fail results and redirect bounties between the doer and the creator within the normal 95/5 and 90/10 splits.

Mitigations:
- The owner can rotate the signer at any time with `setInviteSigner`. That invalidates every unused permit from the old key.
- Every rotation emits `InviteSignerUpdated(oldSigner, newSigner)`.
- Keep the signer key in a KMS/HSM, keep permit deadlines short (minutes), and watch `MemberJoined` events for unusual volume.

Because the owner can set the signer, the owner holds the same indirect power. Make the owner a multisig.

## Who can vote

The voter list is fixed when proof is posted. You can vote if:
- you were a member when proof was posted (people who join later can never vote on that dare), and
- you are neither the doer nor the creator.

The contract records each member's join order and the member count at proof time, so the snapshot is exact even when someone joins in the same block. `eligible = members at proof - 2`. It is always at least 1, because the group had 3 or more members when the dare was created and members can't leave.

## Vote rules

| Rule | Condition |
|---|---|
| Pass locks early | `passVotes * 2 >= eligible` (half or more voted pass) |
| Fail locks early | `failVotes * 2 > eligible` (a strict majority voted fail) |
| After `voteEnd` | Pass if `passVotes >= failVotes`. Ties and zero votes count as **pass**. |

A dare can be settled the moment a lock applies, before `voteEnd`. Once locked, later votes can't change the result: at most `eligible` people can vote, so the two locks can never both be true.

## Owner powers

The owner uses `Ownable2Step`, so a new owner must accept the transfer. The owner can only:

1. **Pause and unpause** new groups and new dares (`createGroup` and `createDare`). Everything else keeps working while paused: joining, accepting, posting proof, voting, settling, and cancelling. Escrowed funds can never be frozen.
2. **Set the max bounty** for new dares, anywhere from 1 $wif up to the hard cap of 5,000,000 $wif.
3. **Rotate the invite signer** (`setInviteSigner`). See the trust note above.

No function lets the owner, the invite signer, or anyone else move escrowed tokens except through `cancelDare` and `settle`. The contract also has:
- no upgradeability
- no `receive` or `fallback`, so it rejects ETH
- no fee withdrawal

## Smart-account compatibility

Users run Privy embedded wallets upgraded through EIP-7702, so their addresses have code. The contract never checks `tx.origin`, `extcodesize`, or whether a caller is an EOA. Permits are issued to the user's wallet address, whatever code it has. The signature check applies to the **backend** signer only, which is an EOA. The tests run the full flow from both a forwarding wallet contract and addresses carrying a 7702 delegation designator.

## Frontend views

- `getDare(id)` returns every field of the dare, including `state` and `outcome`. State `None` means the dare does not exist.
- `getGroup(id)` returns the group's data. A zero `creator` means the group does not exist.
- `isMember(groupId, account)` and `joinedAt(groupId, account)` give membership details.
- `hasVoted(dareId, account)` says whether an account has voted.
- `resolvable(dareId)` returns `(canSettle, outcome)`. `outcome` is what `settle` would produce right now, or `None` if it can't settle yet. Use it to decide when to show the Settle button.
- `joinPermitDigest(...)`, `inviteSigner()` and `eip712Domain()` support the permit flow.

ABIs for the web app live in [`abi/`](abi/). Regenerate them with `./script/export-abi.sh`.

## Develop

```bash
forge build
forge test -vv
forge test --gas-report
forge coverage
./script/export-abi.sh   # writes abi/BYWEscrow.json and abi/MockWIF.json

# fork test against mainnet $wif (read-only; it is skipped when the env var is unset)
ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com forge test --match-path test/BYWEscrow.fork.t.sol -vvv
```

## Deploy (not done yet)

```bash
cp .env.example .env   # fill in DEPLOYER_PRIVATE_KEY and INVITE_SIGNER_ADDRESS; .env is gitignored
source .env
forge script script/Deploy.s.sol --rpc-url $ROBINHOOD_RPC_URL --broadcast
```

On testnet (chain 46630), set `DEPLOY_MOCK_WIF=true` and point `ROBINHOOD_RPC_URL` at the testnet RPC. The script deploys `src/mocks/MockWIF.sol` ("Mock World is Flat" / mWIF, 18 decimals), mints 1,000,000,000 mWIF to the deployer, and uses it as the token. The script refuses `DEPLOY_MOCK_WIF=true` on chain 4663.

The deployer becomes the owner. Transfer ownership to a multisig after deploying.
