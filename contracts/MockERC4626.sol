// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

/**
 * Minimal, GATELESS ERC-4626 vault for the Shade private-DeFi E2E.
 *
 * - No `canReceiveShares` / KYC gate: an ephemeral ExecutionAccount can deposit
 *   (this is the property `requiresUngatedVault` checks for).
 * - Wraps an existing ERC-20 (`asset_`), e.g. the Unlink test token (USDC).
 * - Inflation/dead-deposit protection is seeded by the deploy script (a small
 *   first deposit to 0x...dEaD), not in the constructor, so the vault stays a
 *   plain canonical 4626.
 */
contract MockERC4626 is ERC4626 {
    constructor(IERC20 asset_) ERC20("Shade Mock Vault", "smVAULT") ERC4626(asset_) {}
}
