// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BYWEscrow} from "../src/BYWEscrow.sol";

/// @notice Runs one full PASS flow against the real $wif token on a Robinhood Chain mainnet fork.
/// @dev Skips (returns early) when ROBINHOOD_RPC_URL is not set. Nothing is broadcast; all state is local.
///   ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com forge test --match-path test/BYWEscrow.fork.t.sol -vvv
contract BYWEscrowForkTest is Test {
    address internal constant WIF = 0x5173b8eA6923c2d40267890D45C46a3480954773;
    uint256 internal constant CHAIN_ID = 4663;

    function test_fork_passFlow_burnsRealSupply() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            console2.log("ROBINHOOD_RPC_URL not set, skipping fork test");
            return;
        }
        vm.createSelectFork(rpc);
        assertEq(block.chainid, CHAIN_ID, "not Robinhood Chain mainnet");
        console2.log("forked at block", block.number);

        IERC20 wif = IERC20(WIF);
        uint256 signerPk = 0x5161e57e570001; // TEST-ONLY key, local fork only
        BYWEscrow escrow = new BYWEscrow(wif, vm.addr(signerPk));

        address creator = makeAddr("fork-creator");
        address doer = makeAddr("fork-doer");
        address voter = makeAddr("fork-voter");
        uint256 amount = 10_000e18;

        // deal() writes the balance slot only; totalSupply is untouched (adjust = false).
        deal(WIF, creator, amount);
        assertEq(wif.balanceOf(creator), amount);

        vm.startPrank(creator);
        wif.approve(address(escrow), amount);
        uint256 gid = escrow.createGroup(false);
        vm.stopPrank();
        _permitJoin(escrow, signerPk, gid, doer);
        _permitJoin(escrow, signerPk, gid, voter);
        assertEq(escrow.getGroup(gid).memberCount, 3);

        vm.prank(creator);
        uint256 id = escrow.createDare(gid, doer, amount, 1 hours, 15 minutes, keccak256("dare"));
        vm.startPrank(doer);
        escrow.acceptDare(id);
        escrow.submitProof(id, keccak256("proof"));
        vm.stopPrank();
        vm.prank(voter);
        escrow.vote(id, true);

        uint256 supplyBefore = wif.totalSupply();
        uint256 deadBefore = wif.balanceOf(0x000000000000000000000000000000000000dEaD);

        vm.recordLogs();
        escrow.settle(id);

        uint256 burned = amount * escrow.PASS_BURN_BPS() / 10_000;
        uint256 supplyAfter = wif.totalSupply();
        console2.log("totalSupply before", supplyBefore);
        console2.log("totalSupply after ", supplyAfter);
        console2.log("burned           ", burned);

        assertEq(supplyBefore - supplyAfter, burned, "real totalSupply dropped by exactly the burn");
        assertEq(wif.balanceOf(doer), amount - burned, "doer got 95%");
        assertEq(wif.balanceOf(address(escrow)), 0, "escrow empty");
        assertEq(wif.balanceOf(0x000000000000000000000000000000000000dEaD), deadBefore, "no transfer to dEaD");
        assertEq(uint8(escrow.getDare(id).outcome), uint8(BYWEscrow.Outcome.Passed));
    }

    /// @dev Signs the permit with the test key over the contract's digest and joins. The digest itself is
    ///      checked independently of the contract in BYWEscrow.t.sol.
    function _permitJoin(BYWEscrow escrow, uint256 pk, uint256 gid, address who) internal {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, escrow.joinPermitDigest(gid, who, deadline));
        vm.prank(who);
        escrow.joinGroup(gid, deadline, abi.encodePacked(r, s, v));
    }
}
