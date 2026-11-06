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
        BYWEscrow escrow = new BYWEscrow(wif);

        address creator = makeAddr("fork-creator");
        address doer = makeAddr("fork-doer");
        address voter = makeAddr("fork-voter");
        uint256 amount = 10_000e18;

        // deal() writes the balance slot only; totalSupply is untouched (adjust = false).
        deal(WIF, creator, amount);
        assertEq(wif.balanceOf(creator), amount);

        vm.startPrank(creator);
        wif.approve(address(escrow), amount);
        uint256 gid = escrow.createGroup(keccak256("fork"), false);
        vm.stopPrank();
        vm.prank(doer);
        escrow.joinGroup(gid, "fork");
        vm.prank(voter);
        escrow.joinGroup(gid, "fork");

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
        assertTrue(escrow.getDare(id).passed);
    }
}
