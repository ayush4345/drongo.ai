// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AddressLimbs} from "./AddressLimbs.sol";

/**
 * @title SlateAgentRegistry
 * @notice Channel identity + open/closed lifecycle.
 */
contract SlateAgentRegistry {
    using AddressLimbs for address;

    uint256 public constant N_PUBLIC = 13;
    uint256 public constant IDX_CHANNEL_ID = 0;
    uint256 public constant IDX_RATE_COMMITMENT = 1;
    uint256 public constant IDX_CONSUMER_PUBKEY_X = 5;
    uint256 public constant IDX_CONSUMER_PUBKEY_Y = 6;
    uint256 public constant IDX_DEPOSITOR_HI = 7;
    uint256 public constant IDX_DEPOSITOR_LO = 8;
    uint256 public constant IDX_PROVIDER_HI = 9;
    uint256 public constant IDX_PROVIDER_LO = 10;
    uint256 public constant IDX_TOKEN_HI = 11;
    uint256 public constant IDX_TOKEN_LO = 12;

    enum ChannelStatus {
        Open,
        Closed
    }

    struct ChannelRecord {
        uint256 rateCommitment;
        uint256 consumerPubkeyX;
        uint256 consumerPubkeyY;
        address depositor;
        address provider;
        address token;
    }

    struct ChannelEntry {
        ChannelRecord record;
        ChannelStatus status;
        bool exists;
    }

    mapping(uint256 channelId => ChannelEntry) private channels;

    error ChannelAlreadyRegistered();
    error ChannelNotFound();
    error WrongPublicInputLength();
    error ChannelIdMismatch();
    error ChannelNotOpen();
    error RateCommitmentMismatch();
    error ConsumerPubkeyMismatch();
    error DepositorMismatch();
    error ProviderMismatch();
    error TokenMismatch();
    error ChannelAlreadyClosed();
    error UnauthorizedCloser();

    event ChannelRegistered(uint256 indexed channelId, address indexed depositor, address provider, address token);
    event ChannelClosed(uint256 indexed channelId, address indexed closer);

    function registerChannel(
        uint256 channelId,
        uint256 rateCommitment,
        uint256 consumerPubkeyX,
        uint256 consumerPubkeyY,
        address depositor,
        address provider,
        address token
    ) external {
        if (msg.sender != depositor) revert UnauthorizedCloser();
        if (channels[channelId].exists) revert ChannelAlreadyRegistered();

        channels[channelId] = ChannelEntry({
            record: ChannelRecord({
                rateCommitment: rateCommitment,
                consumerPubkeyX: consumerPubkeyX,
                consumerPubkeyY: consumerPubkeyY,
                depositor: depositor,
                provider: provider,
                token: token
            }),
            status: ChannelStatus.Open,
            exists: true
        });

        emit ChannelRegistered(channelId, depositor, provider, token);
    }

    function getChannel(uint256 channelId) external view returns (ChannelEntry memory) {
        ChannelEntry memory entry = channels[channelId];
        if (!entry.exists) revert ChannelNotFound();
        return entry;
    }

    function hasChannel(uint256 channelId) external view returns (bool) {
        return channels[channelId].exists;
    }

    function validateForSettlement(uint256 channelId, uint256[13] calldata publicSignals) external view {
        if (publicSignals.length != N_PUBLIC) revert WrongPublicInputLength();
        if (publicSignals[IDX_CHANNEL_ID] != channelId) revert ChannelIdMismatch();

        ChannelEntry memory entry = channels[channelId];
        if (!entry.exists) revert ChannelNotFound();
        if (entry.status != ChannelStatus.Open) revert ChannelNotOpen();

        ChannelRecord memory record = entry.record;
        if (publicSignals[IDX_RATE_COMMITMENT] != record.rateCommitment) {
            revert RateCommitmentMismatch();
        }
        if (
            publicSignals[IDX_CONSUMER_PUBKEY_X] != record.consumerPubkeyX
                || publicSignals[IDX_CONSUMER_PUBKEY_Y] != record.consumerPubkeyY
        ) {
            revert ConsumerPubkeyMismatch();
        }

        _requireAddressMatches(record.depositor, publicSignals[IDX_DEPOSITOR_HI], publicSignals[IDX_DEPOSITOR_LO], 0);
        _requireAddressMatches(record.provider, publicSignals[IDX_PROVIDER_HI], publicSignals[IDX_PROVIDER_LO], 1);
        _requireAddressMatches(record.token, publicSignals[IDX_TOKEN_HI], publicSignals[IDX_TOKEN_LO], 2);
    }

    function closeChannel(uint256 channelId) external {
        ChannelEntry storage entry = channels[channelId];
        if (!entry.exists) revert ChannelNotFound();
        if (entry.status == ChannelStatus.Closed) revert ChannelAlreadyClosed();
        if (msg.sender != entry.record.depositor && msg.sender != entry.record.provider) {
            revert UnauthorizedCloser();
        }

        entry.status = ChannelStatus.Closed;
        emit ChannelClosed(channelId, msg.sender);
    }

    function _requireAddressMatches(address account, uint256 hi, uint256 lo, uint8 role) private pure {
        if (!account.matches(hi, lo)) {
            if (role == 0) revert DepositorMismatch();
            if (role == 1) revert ProviderMismatch();
            revert TokenMismatch();
        }
    }
}
