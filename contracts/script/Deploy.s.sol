// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BYWEscrow} from "../src/BYWEscrow.sol";

/// @notice Deploys BYWEscrow. The deployer becomes the owner (transfer to a multisig afterwards).
/// @dev Usage (do not run until reviewed):
///   source .env
///   forge script script/Deploy.s.sol --rpc-url $ROBINHOOD_RPC_URL --broadcast
contract Deploy is Script {
    function run() external returns (BYWEscrow escrow) {
        address wif = vm.envAddress("WIF_ADDRESS");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        require(wif.code.length > 0, "WIF_ADDRESS has no code on this chain");

        vm.startBroadcast(deployerKey);
        escrow = new BYWEscrow(IERC20(wif));
        vm.stopBroadcast();

        console2.log("chain id ", block.chainid);
        console2.log("token    ", wif);
        console2.log("owner    ", escrow.owner());
        console2.log("BYWEscrow", address(escrow));
    }
}
