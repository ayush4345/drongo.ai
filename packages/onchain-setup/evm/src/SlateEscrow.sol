// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "./interfaces/IERC20.sol";
import {AddressLimbs} from "./AddressLimbs.sol";
import {SettlementVerifier} from "./SettlementVerifier.sol";
import {SlateAgentRegistry} from "./SlateAgentRegistry.sol";

/**
 * @title SlateEscrow
 * @notice ERC-20 custody, proof verify, nullifier, payout.
 */
contract SlateEscrow {
    using AddressLimbs for address;

    uint256 public constant N_PUBLIC = 13;
    uint256 public constant IDX_CHANNEL_ID = 0;
    uint256 public constant IDX_ESCROW_AMOUNT = 2;
    uint256 public constant IDX_SETTLEMENT_AMOUNT = 3;
    uint256 public constant IDX_NULLIFIER = 4;
    uint256 public constant IDX_DEPOSITOR_HI = 7;
    uint256 public constant IDX_DEPOSITOR_LO = 8;
    uint256 public constant IDX_PROVIDER_HI = 9;
    uint256 public constant IDX_PROVIDER_LO = 10;
    uint256 public constant IDX_TOKEN_HI = 11;
    uint256 public constant IDX_TOKEN_LO = 12;

    SettlementVerifier public verifier;
    SlateAgentRegistry public registry;
    mapping(address token => bool) public whitelisted;
    mapping(address user => mapping(address token => uint256)) public balances;
    mapping(uint256 nullifier => bool) public spentNullifier;

    bool private initialized;

    error AlreadyInitialized();
    error NotInitialized();
    error InvalidAmount();
    error TokenNotWhitelisted();
    error WrongPublicInputLength();
    error DepositorMismatch();
    error ProviderMismatch();
    error TokenMismatch();
    error InvalidProof();
    error SettlementExceedsEscrow();
    error NullifierSpent();
    error InsufficientBalance();
    error NoBalanceToRefund();
    error AmountOverflow();

    event Initialized(address verifier, address registry);
    event TokenWhitelisted(address indexed token);
    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Settled(
        uint256 indexed channelId,
        address indexed depositor,
        address indexed provider,
        address token,
        uint256 settlementAmount,
        uint256 refundAmount,
        uint256 nullifier
    );
    event Refunded(address indexed depositor, address indexed token, uint256 amount);

    function init(address verifier_, address registry_) external {
        if (initialized) revert AlreadyInitialized();
        initialized = true;
        verifier = SettlementVerifier(verifier_);
        registry = SlateAgentRegistry(registry_);
        emit Initialized(verifier_, registry_);
    }

    function whitelistToken(address token) external {
        if (!initialized) revert NotInitialized();
        whitelisted[token] = true;
        emit TokenWhitelisted(token);
    }

    function addToDepositors(address user, uint256 amount, address token) external {
        if (!initialized) revert NotInitialized();
        if (msg.sender != user) revert DepositorMismatch();
        if (amount == 0) revert InvalidAmount();
        if (!whitelisted[token]) revert TokenNotWhitelisted();

        bool ok = IERC20(token).transferFrom(user, address(this), amount);
        require(ok, "transferFrom failed");

        balances[user][token] += amount;
        emit Deposited(user, token, amount);
    }

    function getBalance(address user, address token) external view returns (uint256) {
        return balances[user][token];
    }

    function settle(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[13] calldata publicSignals,
        address depositor,
        address provider,
        address token
    ) external {
        if (!initialized) revert NotInitialized();
        if (publicSignals.length != N_PUBLIC) revert WrongPublicInputLength();

        registry.validateForSettlement(publicSignals[IDX_CHANNEL_ID], publicSignals);

        _requireAddressMatches(depositor, publicSignals[IDX_DEPOSITOR_HI], publicSignals[IDX_DEPOSITOR_LO], 0);
        _requireAddressMatches(provider, publicSignals[IDX_PROVIDER_HI], publicSignals[IDX_PROVIDER_LO], 1);
        _requireAddressMatches(token, publicSignals[IDX_TOKEN_HI], publicSignals[IDX_TOKEN_LO], 2);

        if (!verifier.verifyProof(a, b, c, publicSignals)) revert InvalidProof();

        uint256 escrowAmount = publicSignals[IDX_ESCROW_AMOUNT];
        uint256 settlementAmount = publicSignals[IDX_SETTLEMENT_AMOUNT];
        uint256 nullifier = publicSignals[IDX_NULLIFIER];

        if (escrowAmount > type(uint128).max || settlementAmount > type(uint128).max) {
            revert AmountOverflow();
        }
        if (settlementAmount > escrowAmount) revert SettlementExceedsEscrow();
        if (spentNullifier[nullifier]) revert NullifierSpent();
        spentNullifier[nullifier] = true;

        uint256 currentBalance = balances[depositor][token];
        if (currentBalance < escrowAmount) revert InsufficientBalance();
        balances[depositor][token] = currentBalance - escrowAmount;

        if (settlementAmount > 0) {
            bool paid = IERC20(token).transfer(provider, settlementAmount);
            require(paid, "provider transfer failed");
        }

        uint256 refundAmount = escrowAmount - settlementAmount;
        if (refundAmount > 0) {
            bool refunded = IERC20(token).transfer(depositor, refundAmount);
            require(refunded, "depositor refund failed");
        }

        emit Settled(
            publicSignals[IDX_CHANNEL_ID],
            depositor,
            provider,
            token,
            settlementAmount,
            refundAmount,
            nullifier
        );
    }

    function refund(address depositor, address token) external {
        if (!initialized) revert NotInitialized();
        if (msg.sender != depositor) revert DepositorMismatch();
        if (!whitelisted[token]) revert TokenNotWhitelisted();

        uint256 balance = balances[depositor][token];
        if (balance == 0) revert NoBalanceToRefund();

        balances[depositor][token] = 0;
        bool ok = IERC20(token).transfer(depositor, balance);
        require(ok, "refund transfer failed");
        emit Refunded(depositor, token, balance);
    }

    function _requireAddressMatches(address account, uint256 hi, uint256 lo, uint8 role) private pure {
        if (!account.matches(hi, lo)) {
            if (role == 0) revert DepositorMismatch();
            if (role == 1) revert ProviderMismatch();
            revert TokenMismatch();
        }
    }
}
