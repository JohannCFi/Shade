// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * Minimal mock venues for the Shade /spy demo, so the agent can execute the three
 * private-DeFi transaction TYPES (swap / vault / aave-supply) against deployed
 * contracts on arc-testnet. These are demo stand-ins (fixed 1:1 rate, freely
 * mintable), NOT production protocols — they only need to satisfy the adapter ABIs
 * in src/defi/primitives/* so execute() + depositBack succeed.
 */

/** Freely-mintable ERC-20 used as the swap output token ("mWETH") and elsewhere. */
contract MockERC20 is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _dec = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * Uniswap-v3-shaped router: exactInputSingle pulls tokenIn from msg.sender and
 * pays tokenOut (1:1) to recipient. Must hold a tokenOut balance to pay out.
 */
contract MockSwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 amountOut) {
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        amountOut = p.amountIn; // fixed 1:1 demo rate
        require(amountOut >= p.amountOutMinimum, "MockSwapRouter: insufficient output");
        require(IERC20(p.tokenOut).transfer(p.recipient, amountOut), "MockSwapRouter: payout failed");
    }
}

/** Uniswap-v3-shaped QuoterV2: returns the 1:1 quote (view; simulateContract reads it). */
contract MockQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams calldata p)
        external
        pure
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)
    {
        return (p.amountIn, 0, 0, 0);
    }
}

/** aToken: ERC-20 minted 1:1 by the pool on supply. */
contract MockAToken is ERC20 {
    address public immutable pool;
    uint8 private immutable _dec;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address pool_) ERC20(name_, symbol_) {
        _dec = decimals_;
        pool = pool_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == pool, "MockAToken: only pool");
        _mint(to, amount);
    }
}

/**
 * Aave-v3-shaped pool: supply pulls `asset` and mints aToken 1:1 to onBehalfOf.
 * getReserveData returns the aToken in the canonical 9th return slot.
 */
contract MockAavePool {
    address public immutable asset;
    MockAToken public immutable aToken;

    constructor(address asset_, uint8 decimals_) {
        asset = asset_;
        aToken = new MockAToken("Mock aUSDC", "maUSDC", decimals_, address(this));
    }

    function supply(address asset_, uint256 amount, address onBehalfOf, uint16 /*referralCode*/) external {
        require(asset_ == asset, "MockAavePool: wrong asset");
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        aToken.mint(onBehalfOf, amount);
    }

    function getReserveData(address /*asset*/)
        external
        view
        returns (
            uint256 configuration,
            uint128 liquidityIndex,
            uint128 currentLiquidityRate,
            uint128 variableBorrowIndex,
            uint128 currentVariableBorrowRate,
            uint128 currentStableBorrowRate,
            uint40 lastUpdateTimestamp,
            uint16 id,
            address aTokenAddress,
            address stableDebtTokenAddress,
            address variableDebtTokenAddress,
            address interestRateStrategyAddress,
            uint128 accruedToTreasury,
            uint128 unbacked,
            uint128 isolationModeTotalDebt
        )
    {
        return (0, 0, 0, 0, 0, 0, 0, 0, address(aToken), address(0), address(0), address(0), 0, 0, 0);
    }
}
