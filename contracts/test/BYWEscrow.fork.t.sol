// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BYWEscrow} from "../src/BYWEscrow.sol";

/// @notice Full flows against the real $wif token on a Robinhood Chain mainnet fork: a PASS that burns
///         exactly 5% of the bounty from the real supply, and a NO VOTES dare that refunds exactly 100%.
/// @dev Uses MAINNET_RPC_QUICKNODE if set, else ROBINHOOD_RPC_URL; skips (returns early) when neither is
///      set. Nothing is broadcast; all state is local to the fork. The RPC URL is never logged.
///   forge test --match-path test/BYWEscrow.fork.t.sol -vv
contract BYWEscrowForkTest is Test {
    address internal constant WIF = 0x5173b8eA6923c2d40267890D45C46a3480954773;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 internal constant CHAIN_ID = 4663;
    uint256 internal constant SIGNER_PK = 0x5161e57e570001; // TEST-ONLY key, local fork only
    uint256 internal constant AMOUNT = 10_000e18;

    IERC20 internal wif = IERC20(WIF);
    BYWEscrow internal escrow;
    address internal creator = makeAddr("fork-creator");
    address internal doer = makeAddr("fork-doer");
    address internal voter = makeAddr("fork-voter");
    address internal late = makeAddr("fork-late-joiner");

    /// @return ok False when no RPC is configured (the test then returns early).
    function _fork() internal returns (bool ok) {
        string memory rpc = vm.envOr("MAINNET_RPC_QUICKNODE", string(""));
        if (bytes(rpc).length == 0) rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            console2.log("no mainnet RPC set, skipping fork test");
            return false;
        }
        vm.createSelectFork(rpc);
        assertEq(block.chainid, CHAIN_ID, "not Robinhood Chain mainnet");
        console2.log("forked at block", block.number);
        escrow = new BYWEscrow(wif, vm.addr(SIGNER_PK));
        return true;
    }

    /// @dev Public group of 3 (creator, doer, voter), a dare at the public cap's limit, accepted and proven.
    ///      A wallet that joins after the dare is created cannot vote.
    function _votingDare() internal returns (uint256 id) {
        // deal() writes the balance slot only; totalSupply is untouched (adjust = false).
        deal(WIF, creator, AMOUNT);
        assertEq(wif.balanceOf(creator), AMOUNT);

        vm.startPrank(creator);
        wif.approve(address(escrow), AMOUNT);
        uint256 gid = escrow.createGroup(true);
        vm.stopPrank();
        _permitJoin(gid, doer);
        _permitJoin(gid, voter);

        vm.prank(creator);
        id = escrow.createDare(gid, doer, AMOUNT, 1 hours, 15 minutes, keccak256("dare"));
        assertEq(escrow.getDare(id).voterSnapshot, 3);

        _permitJoin(gid, late);
        vm.startPrank(doer);
        escrow.acceptDare(id);
        escrow.submitProof(id, keccak256("proof"));
        vm.stopPrank();
        assertEq(escrow.getDare(id).eligible, 1, "only the voter");

        vm.prank(late);
        vm.expectRevert(BYWEscrow.NotEligibleVoter.selector);
        escrow.vote(id, true);
    }

    function test_fork_passFlow_burnsExactly5Percent() public {
        if (!_fork()) return;
        uint256 id = _votingDare();
        vm.prank(voter);
        escrow.vote(id, true);

        uint256 supplyBefore = wif.totalSupply();
        uint256 deadBefore = wif.balanceOf(DEAD);
        escrow.settle(id);

        uint256 burned = AMOUNT * escrow.PASS_BURN_BPS() / 10_000;
        console2.log("totalSupply before", supplyBefore);
        console2.log("totalSupply after ", wif.totalSupply());
        console2.log("burned           ", burned);

        assertEq(burned, AMOUNT * 5 / 100);
        assertEq(supplyBefore - wif.totalSupply(), burned, "real totalSupply dropped by exactly 5%");
        assertEq(wif.balanceOf(doer), AMOUNT - burned, "doer got 95%");
        assertEq(wif.balanceOf(address(escrow)), 0, "escrow empty");
        assertEq(wif.balanceOf(DEAD), deadBefore, "no transfer to dEaD");
        assertEq(uint8(escrow.getDare(id).outcome), uint8(BYWEscrow.Outcome.Passed));
    }

    function test_fork_noVotes_refundsExactly100Percent() public {
        if (!_fork()) return;
        uint256 id = _votingDare();
        assertEq(wif.balanceOf(creator), 0);

        vm.warp(escrow.getDare(id).voteEnd + 1);
        (bool can, BYWEscrow.Outcome outcome) = escrow.resolvable(id);
        assertTrue(can);
        assertEq(uint8(outcome), uint8(BYWEscrow.Outcome.NoVotes));

        uint256 supplyBefore = wif.totalSupply();
        escrow.settle(id);

        assertEq(wif.balanceOf(creator), AMOUNT, "creator got exactly 100% back");
        assertEq(wif.balanceOf(doer), 0, "doer got nothing");
        assertEq(wif.totalSupply(), supplyBefore, "nothing burned");
        assertEq(wif.balanceOf(address(escrow)), 0, "escrow empty");
        assertEq(uint8(escrow.getDare(id).outcome), uint8(BYWEscrow.Outcome.NoVotes));
    }

    /// @dev Signs the permit with the test key over the contract's digest and joins. The digest itself is
    ///      checked independently of the contract in BYWEscrow.t.sol.
    function _permitJoin(uint256 gid, address who) internal {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, escrow.joinPermitDigest(gid, who, deadline));
        vm.prank(who);
        escrow.joinGroup(gid, deadline, abi.encodePacked(r, s, v));
    }
}
