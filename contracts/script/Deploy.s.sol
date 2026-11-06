// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BYWEscrow} from "../src/BYWEscrow.sol";
import {MockWIF} from "../src/mocks/MockWIF.sol";

/// @notice Deploys BYWEscrow. The deployer becomes the owner (transfer to a multisig afterwards).
/// @dev Env:
///   DEPLOYER_PRIVATE_KEY   deployer key (never commit it)
///   INVITE_SIGNER_ADDRESS  backend address that signs EIP-712 join permits
///   WIF_ADDRESS            bounty token (ignored when DEPLOY_MOCK_WIF=true)
///   DEPLOY_MOCK_WIF        "true" on testnet only: deploys Mock World is Flat (mWIF), mints 1B to the
///                          deployer and uses it as the token. Refused on Robinhood Chain mainnet (4663).
/// Usage (do not run until reviewed):
///   source .env
///   forge script script/Deploy.s.sol --rpc-url $ROBINHOOD_RPC_URL --broadcast
contract Deploy is Script {
    uint256 internal constant ROBINHOOD_MAINNET = 4663;
    uint256 internal constant MOCK_SUPPLY = 1_000_000_000e18;

    function run() external returns (BYWEscrow escrow, address tokenAddr) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address inviteSigner = vm.envAddress("INVITE_SIGNER_ADDRESS");
        bool deployMock = vm.envOr("DEPLOY_MOCK_WIF", false);

        if (deployMock) {
            require(block.chainid != ROBINHOOD_MAINNET, "refusing to deploy mock WIF on mainnet");
        } else {
            tokenAddr = vm.envAddress("WIF_ADDRESS");
            require(tokenAddr.code.length > 0, "WIF_ADDRESS has no code on this chain");
        }

        vm.startBroadcast(deployerKey);
        if (deployMock) {
            tokenAddr = address(new MockWIF(deployer, MOCK_SUPPLY));
        }
        escrow = new BYWEscrow(IERC20(tokenAddr), inviteSigner);
        vm.stopBroadcast();

        console2.log("chain id     ", block.chainid);
        console2.log("token        ", tokenAddr);
        console2.log("mock token   ", deployMock);
        console2.log("invite signer", escrow.inviteSigner());
        console2.log("owner        ", escrow.owner());
        console2.log("BYWEscrow    ", address(escrow));
    }
}
