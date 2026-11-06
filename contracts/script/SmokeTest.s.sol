// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BYWEscrow} from "../src/BYWEscrow.sol";

/// @dev Shared env loading and guards for the testnet smoke scripts. TESTNET ONLY (chain 46630).
abstract contract SmokeBase is Script {
    uint256 internal constant TESTNET_CHAIN_ID = 46630;

    IERC20 internal wif;
    BYWEscrow internal escrow;
    uint256 internal deployerPk;
    uint256 internal signerPk;
    uint256 internal aPk;
    uint256 internal bPk;
    uint256 internal cPk;
    address internal deployer;
    address internal a;
    address internal b;
    address internal c;

    function _load() internal {
        require(block.chainid == TESTNET_CHAIN_ID, "smoke test is testnet only (46630)");
        wif = IERC20(vm.envAddress("MOCK_WIF_ADDRESS"));
        escrow = BYWEscrow(vm.envAddress("BYW_ESCROW_ADDRESS"));
        require(address(escrow.token()) == address(wif), "escrow token != MOCK_WIF_ADDRESS");

        deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        signerPk = vm.envUint("INVITE_SIGNER_PRIVATE_KEY");
        aPk = vm.envUint("TEST_A_PRIVATE_KEY");
        bPk = vm.envUint("TEST_B_PRIVATE_KEY");
        cPk = vm.envUint("TEST_C_PRIVATE_KEY");
        deployer = vm.addr(deployerPk);
        a = vm.addr(aPk);
        b = vm.addr(bPk);
        c = vm.addr(cPk);
        require(vm.addr(signerPk) == escrow.inviteSigner(), "INVITE_SIGNER_PRIVATE_KEY is not escrow.inviteSigner");
    }
}

/// @notice Step 4: one full dare end to end, PASS path.
///   forge script script/SmokeTest.s.sol:SmokeTest --rpc-url $ROBINHOOD_TESTNET_RPC_URL --broadcast --slow
contract SmokeTest is SmokeBase {
    uint256 internal constant GAS_DROP = 0.0015 ether;
    uint256 internal constant BOUNTY = 10_000e18;

    function run() external returns (uint256 groupId, uint256 dareId) {
        _load();
        address[3] memory users = [a, b, c];
        uint256[3] memory pks = [aPk, bPk, cPk];

        // 1. gas for A, B, C
        vm.startBroadcast(deployerPk);
        for (uint256 i; i < 3; ++i) {
            (bool ok,) = payable(users[i]).call{value: GAS_DROP}("");
            require(ok, "eth transfer failed");
        }
        // 2. group
        groupId = escrow.createGroup(true);
        vm.stopBroadcast();
        console2.log("step 2 groupId", groupId);

        // 3. A, B, C join with permits signed by the invite signer
        for (uint256 i; i < 3; ++i) {
            uint256 deadline = block.timestamp + 10 minutes;
            bytes32 digest = escrow.joinPermitDigest(groupId, users[i], deadline);
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
            vm.startBroadcast(pks[i]);
            escrow.joinGroup(groupId, deadline, abi.encodePacked(r, s, v));
            vm.stopBroadcast();
        }
        require(escrow.getGroup(groupId).memberCount == 4, "expected 4 members");

        uint256 supply0 = wif.totalSupply();
        uint256 a0 = wif.balanceOf(a);

        // 4. open dare
        vm.startBroadcast(deployerPk);
        wif.approve(address(escrow), BOUNTY);
        dareId = escrow.createDare(
            groupId, address(0), BOUNTY, 1 hours, 15 minutes, keccak256("BYW smoke test: sing at a bus stop")
        );
        vm.stopBroadcast();
        console2.log("step 4 dareId", dareId);

        // 5 + 6. A accepts and posts proof
        vm.startBroadcast(aPk);
        escrow.acceptDare(dareId);
        escrow.submitProof(dareId, keccak256("smoke-proof-1"));
        vm.stopBroadcast();
        require(escrow.getDare(dareId).eligible == 2, "expected eligible = 2");

        // 7. B votes pass (1 * 2 >= 2 locks the pass)
        vm.startBroadcast(bPk);
        escrow.vote(dareId, true);
        vm.stopBroadcast();

        // 8. C settles
        vm.startBroadcast(cPk);
        escrow.settle(dareId);
        vm.stopBroadcast();

        uint256 received = wif.balanceOf(a) - a0;
        uint256 burned = supply0 - wif.totalSupply();
        console2.log("A received (wei)", received);
        console2.log("burned (wei)    ", burned);
        console2.log("escrow balance  ", wif.balanceOf(address(escrow)));
        require(received == 9_500e18, "A did not receive exactly 9,500");
        require(burned == 500e18, "supply did not drop by exactly 500");
        require(wif.balanceOf(address(escrow)) == 0, "escrow not empty");
        require(escrow.getDare(dareId).outcome == BYWEscrow.Outcome.Passed, "outcome != Passed");
        console2.log("ALL SMOKE ASSERTIONS PASSED");
    }
}

/// @notice Step 5: refund path. Dare 2 is accepted by B and left unresolved (settle later as Expired);
///         dare 3 is cancelled while Open for a 100% refund.
///   GROUP_ID=<id> forge script script/SmokeTest.s.sol:SmokeTestRefund --rpc-url $ROBINHOOD_TESTNET_RPC_URL --broadcast --slow
contract SmokeTestRefund is SmokeBase {
    uint256 internal constant BOUNTY = 1_000e18;

    function run() external returns (uint256 pendingDareId, uint256 cancelledDareId) {
        _load();
        uint256 groupId = vm.envUint("GROUP_ID");
        require(escrow.isMember(groupId, deployer) && escrow.isMember(groupId, b), "wrong GROUP_ID");

        vm.startBroadcast(deployerPk);
        wif.approve(address(escrow), 2 * BOUNTY);
        pendingDareId =
            escrow.createDare(groupId, address(0), BOUNTY, 1 hours, 15 minutes, keccak256("BYW smoke test: dare 2"));
        vm.stopBroadcast();

        vm.startBroadcast(bPk);
        escrow.acceptDare(pendingDareId);
        vm.stopBroadcast();
        require(escrow.getDare(pendingDareId).state == BYWEscrow.DareState.Accepted, "dare 2 not accepted");

        uint256 before = wif.balanceOf(deployer);
        vm.startBroadcast(deployerPk);
        cancelledDareId =
            escrow.createDare(groupId, address(0), BOUNTY, 1 hours, 15 minutes, keccak256("BYW smoke test: dare 3"));
        escrow.cancelDare(cancelledDareId);
        vm.stopBroadcast();

        require(wif.balanceOf(deployer) == before, "cancel did not refund exactly 1,000");
        require(escrow.getDare(cancelledDareId).state == BYWEscrow.DareState.Cancelled, "dare 3 not cancelled");
        console2.log("pending (accepted) dareId", pendingDareId);
        console2.log("cancelled dareId         ", cancelledDareId);
        console2.log("REFUND ASSERTIONS PASSED");
    }
}
