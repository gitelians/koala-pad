// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title Math
 * @notice Library for mathematical operations used in the launchpad
 */
library Math {
    /**
     * @notice Calculate square root using Babylonian method
     * @param y Input value
     * @return z Square root of y
     */
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    /**
     * @notice Safe minimum function
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
