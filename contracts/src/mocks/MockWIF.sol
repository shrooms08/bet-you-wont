// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title Mock World is Flat (mWIF)
/// @notice TEST/TESTNET ONLY. A plain OZ v5 ERC20 + ERC20Burnable with 18 decimals, matching the real $wif
///         token's behaviour (no fees, no blacklist, no pause, no permit). The whole supply is minted once
///         to `initialHolder` at deployment; there is no public mint.
contract MockWIF is ERC20, ERC20Burnable {
    constructor(address initialHolder, uint256 initialSupply) ERC20("Mock World is Flat", "mWIF") {
        _mint(initialHolder, initialSupply);
    }
}
