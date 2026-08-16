// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @notice Option A address encoding: left-pad a 20-byte EVM address to 32 bytes,
 * then split into hi/lo uint128 limbs (big-endian), matching the circuit
 * public-signal layout.
 */
library AddressLimbs {
    function toLimbs(address account) internal pure returns (uint256 hi, uint256 lo) {
        bytes32 padded = bytes32(uint256(uint160(account)));
        hi = uint256(uint128(bytes16(padded)));
        lo = uint256(uint128(bytes16(padded << 128)));
    }

    function matches(address account, uint256 hi, uint256 lo) internal pure returns (bool) {
        (uint256 expectedHi, uint256 expectedLo) = toLimbs(account);
        return expectedHi == hi && expectedLo == lo;
    }
}
