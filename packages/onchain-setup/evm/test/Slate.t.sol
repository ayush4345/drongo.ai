// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AddressLimbs} from "../src/AddressLimbs.sol";
import {SlateAgentRegistry} from "../src/SlateAgentRegistry.sol";
import {SlateEscrow} from "../src/SlateEscrow.sol";
import {SettlementVerifier} from "../src/SettlementVerifier.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract AddressLimbsTest is Test {
    function test_leftPadSplitMatchesKnownAddress() public pure {
        address a = address(0x1234567890123456789012345678901234567890);
        (uint256 hi, uint256 lo) = AddressLimbs.toLimbs(a);
        // 12 zero bytes + 20 address bytes → hi has first 4 address bytes in low end of hi
        assertEq(hi, 0x00000000000000000000000012345678);
        assertEq(lo, 0x90123456789012345678901234567890);
        assertTrue(AddressLimbs.matches(a, hi, lo));
    }
}

contract SlateAgentRegistryTest is Test {
    SlateAgentRegistry registry;
    address depositor = address(0xA11CE);
    address provider = address(0xB0B);
    address token = address(0xC0FFEE);
    address stranger = address(0xBAD);

    uint256 constant CHANNEL_ID = 42;
    uint256 constant RATE = 7;
    uint256 constant PKX = 11;
    uint256 constant PKY = 13;

    function setUp() public {
        registry = new SlateAgentRegistry();
    }

    function _register() internal {
        vm.prank(depositor);
        registry.registerChannel(CHANNEL_ID, RATE, PKX, PKY, depositor, provider, token);
    }

    function _signalsMatching() internal view returns (uint256[13] memory s) {
        s[0] = CHANNEL_ID;
        s[1] = RATE;
        s[5] = PKX;
        s[6] = PKY;
        (s[7], s[8]) = AddressLimbs.toLimbs(depositor);
        (s[9], s[10]) = AddressLimbs.toLimbs(provider);
        (s[11], s[12]) = AddressLimbs.toLimbs(token);
    }

    function test_registerAndGet() public {
        _register();
        assertTrue(registry.hasChannel(CHANNEL_ID));
        SlateAgentRegistry.ChannelEntry memory entry = registry.getChannel(CHANNEL_ID);
        assertEq(entry.record.depositor, depositor);
        assertEq(uint256(entry.status), uint256(SlateAgentRegistry.ChannelStatus.Open));
    }

    function test_rejectDuplicate() public {
        _register();
        vm.prank(depositor);
        vm.expectRevert(SlateAgentRegistry.ChannelAlreadyRegistered.selector);
        registry.registerChannel(CHANNEL_ID, RATE, PKX, PKY, depositor, provider, token);
    }

    function test_rejectNonDepositorRegister() public {
        vm.prank(stranger);
        vm.expectRevert(SlateAgentRegistry.UnauthorizedCloser.selector);
        registry.registerChannel(CHANNEL_ID, RATE, PKX, PKY, depositor, provider, token);
    }

    function test_validateAcceptsMatchingSignals() public {
        _register();
        registry.validateForSettlement(CHANNEL_ID, _signalsMatching());
    }

    function test_validateRejectsWrongRate() public {
        _register();
        uint256[13] memory s = _signalsMatching();
        s[1] = 999;
        vm.expectRevert(SlateAgentRegistry.RateCommitmentMismatch.selector);
        registry.validateForSettlement(CHANNEL_ID, s);
    }

    function test_closeByDepositorThenRejectValidate() public {
        _register();
        vm.prank(depositor);
        registry.closeChannel(CHANNEL_ID);
        vm.expectRevert(SlateAgentRegistry.ChannelNotOpen.selector);
        registry.validateForSettlement(CHANNEL_ID, _signalsMatching());
    }

    function test_closeRejectsStranger() public {
        _register();
        vm.prank(stranger);
        vm.expectRevert(SlateAgentRegistry.UnauthorizedCloser.selector);
        registry.closeChannel(CHANNEL_ID);
    }
}

contract SlateEscrowFlowTest is Test {
    SettlementVerifier verifier;
    SlateAgentRegistry registry;
    SlateEscrow escrow;
    MockERC20 usdc;

    address depositor = address(0xA11CE);
    address provider = address(0xB0B);

    uint256 constant CHANNEL_ID = 1;
    uint256 constant RATE = 100;
    uint256 constant PKX = 5;
    uint256 constant PKY = 6;
    uint256 constant ESCROW = 20_000_000;
    uint256 constant SETTLEMENT = 14_862_000;

    function setUp() public {
        verifier = new SettlementVerifier();
        registry = new SlateAgentRegistry();
        escrow = new SlateEscrow();
        escrow.init(address(verifier), address(registry));
        usdc = new MockERC20();
        escrow.whitelistToken(address(usdc));

        usdc.mint(depositor, ESCROW * 2);
        vm.prank(depositor);
        usdc.approve(address(escrow), type(uint256).max);

        vm.prank(depositor);
        registry.registerChannel(CHANNEL_ID, RATE, PKX, PKY, depositor, provider, address(usdc));
    }

    function test_depositAccumulates() public {
        vm.prank(depositor);
        escrow.addToDepositors(depositor, ESCROW, address(usdc));
        assertEq(escrow.getBalance(depositor, address(usdc)), ESCROW);
        assertEq(usdc.balanceOf(address(escrow)), ESCROW);

        vm.prank(depositor);
        escrow.addToDepositors(depositor, ESCROW, address(usdc));
        assertEq(escrow.getBalance(depositor, address(usdc)), ESCROW * 2);
    }

    function test_refundReturnsFullBalance() public {
        vm.prank(depositor);
        escrow.addToDepositors(depositor, ESCROW, address(usdc));
        vm.prank(depositor);
        escrow.refund(depositor, address(usdc));
        assertEq(escrow.getBalance(depositor, address(usdc)), 0);
        assertEq(usdc.balanceOf(depositor), ESCROW * 2);
    }

    function test_settleRejectsBadProofAfterDeposit() public {
        vm.prank(depositor);
        escrow.addToDepositors(depositor, ESCROW, address(usdc));

        uint256[13] memory signals;
        signals[0] = CHANNEL_ID;
        signals[1] = RATE;
        signals[2] = ESCROW;
        signals[3] = SETTLEMENT;
        signals[4] = 12345; // nullifier
        signals[5] = PKX;
        signals[6] = PKY;
        (signals[7], signals[8]) = AddressLimbs.toLimbs(depositor);
        (signals[9], signals[10]) = AddressLimbs.toLimbs(provider);
        (signals[11], signals[12]) = AddressLimbs.toLimbs(address(usdc));

        uint256[2] memory a = [uint256(1), uint256(2)];
        uint256[2][2] memory b;
        b[0] = [uint256(1), uint256(1)];
        b[1] = [uint256(1), uint256(1)];
        uint256[2] memory c = [uint256(1), uint256(2)];

        vm.expectRevert(); // pairing / invalid proof
        escrow.settle(a, b, c, signals, depositor, provider, address(usdc));
    }

    function test_rejectNonWhitelistedDeposit() public {
        MockERC20 other = new MockERC20();
        other.mint(depositor, ESCROW);
        vm.prank(depositor);
        other.approve(address(escrow), ESCROW);
        vm.prank(depositor);
        vm.expectRevert(SlateEscrow.TokenNotWhitelisted.selector);
        escrow.addToDepositors(depositor, ESCROW, address(other));
    }

    function test_settleRejectsProviderMismatch() public {
        vm.prank(depositor);
        escrow.addToDepositors(depositor, ESCROW, address(usdc));

        uint256[13] memory signals;
        signals[0] = CHANNEL_ID;
        signals[1] = RATE;
        signals[2] = ESCROW;
        signals[3] = SETTLEMENT;
        signals[4] = 99;
        signals[5] = PKX;
        signals[6] = PKY;
        (signals[7], signals[8]) = AddressLimbs.toLimbs(depositor);
        (signals[9], signals[10]) = AddressLimbs.toLimbs(provider);
        (signals[11], signals[12]) = AddressLimbs.toLimbs(address(usdc));

        uint256[2] memory a = [uint256(1), uint256(2)];
        uint256[2][2] memory b;
        b[0] = [uint256(1), uint256(1)];
        b[1] = [uint256(1), uint256(1)];
        uint256[2] memory c = [uint256(1), uint256(2)];

        address wrongProvider = address(0xDEAD);
        vm.expectRevert(SlateEscrow.ProviderMismatch.selector);
        escrow.settle(a, b, c, signals, depositor, wrongProvider, address(usdc));
    }

    function test_initOnlyOnce() public {
        vm.expectRevert(SlateEscrow.AlreadyInitialized.selector);
        escrow.init(address(verifier), address(registry));
    }

    function test_settlePaysProviderAndRefundsDepositor() public {
        vm.prank(depositor);
        escrow.addToDepositors(depositor, ESCROW, address(usdc));
        _mockValidProof();

        uint256 depositorBefore = usdc.balanceOf(depositor);
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) = _dummyProof();
        escrow.settle(a, b, c, _matchingSignals(12345), depositor, provider, address(usdc));

        assertEq(escrow.getBalance(depositor, address(usdc)), 0);
        assertEq(usdc.balanceOf(provider), SETTLEMENT);
        assertEq(usdc.balanceOf(depositor), depositorBefore + (ESCROW - SETTLEMENT));
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_settleRejectsWrongDepositor() public {
        vm.prank(depositor);
        escrow.addToDepositors(depositor, ESCROW, address(usdc));

        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) = _dummyProof();
        vm.expectRevert(SlateEscrow.DepositorMismatch.selector);
        escrow.settle(a, b, c, _matchingSignals(7), address(0xDEAD), provider, address(usdc));
    }

    function test_settleRejectsInsufficientBalance() public {
        vm.prank(depositor);
        escrow.addToDepositors(depositor, ESCROW - 1, address(usdc));
        _mockValidProof();

        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) = _dummyProof();
        vm.expectRevert(SlateEscrow.InsufficientBalance.selector);
        escrow.settle(a, b, c, _matchingSignals(8), depositor, provider, address(usdc));
    }

    function test_settleRejectsClosedChannel() public {
        vm.prank(depositor);
        escrow.addToDepositors(depositor, ESCROW, address(usdc));
        vm.prank(depositor);
        registry.closeChannel(CHANNEL_ID);
        _mockValidProof();

        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) = _dummyProof();
        vm.expectRevert(SlateAgentRegistry.ChannelNotOpen.selector);
        escrow.settle(a, b, c, _matchingSignals(9), depositor, provider, address(usdc));
    }

    function test_settleRejectsUnregisteredChannel() public {
        vm.prank(depositor);
        escrow.addToDepositors(depositor, ESCROW, address(usdc));
        _mockValidProof();

        uint256[13] memory s = _matchingSignals(10);
        s[0] = 999;
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) = _dummyProof();
        vm.expectRevert(SlateAgentRegistry.ChannelNotFound.selector);
        escrow.settle(a, b, c, s, depositor, provider, address(usdc));
    }

    function test_addToDepositorsRejectsZero() public {
        vm.prank(depositor);
        vm.expectRevert(SlateEscrow.InvalidAmount.selector);
        escrow.addToDepositors(depositor, 0, address(usdc));
    }

    function test_refundRejectsZeroBalance() public {
        vm.prank(depositor);
        vm.expectRevert(SlateEscrow.NoBalanceToRefund.selector);
        escrow.refund(depositor, address(usdc));
    }

    function test_settleRejectsDoubleNullifier() public {
        vm.prank(depositor);
        escrow.addToDepositors(depositor, ESCROW * 2, address(usdc));
        _mockValidProof();

        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c) = _dummyProof();
        uint256[13] memory signals = _matchingSignals(12345);
        escrow.settle(a, b, c, signals, depositor, provider, address(usdc));

        vm.expectRevert(SlateEscrow.NullifierSpent.selector);
        escrow.settle(a, b, c, signals, depositor, provider, address(usdc));
    }

    function _matchingSignals(uint256 nullifier) internal view returns (uint256[13] memory s) {
        s[0] = CHANNEL_ID;
        s[1] = RATE;
        s[2] = ESCROW;
        s[3] = SETTLEMENT;
        s[4] = nullifier;
        s[5] = PKX;
        s[6] = PKY;
        (s[7], s[8]) = AddressLimbs.toLimbs(depositor);
        (s[9], s[10]) = AddressLimbs.toLimbs(provider);
        (s[11], s[12]) = AddressLimbs.toLimbs(address(usdc));
    }

    function _dummyProof()
        internal
        pure
        returns (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c)
    {
        a = [uint256(1), uint256(2)];
        b[0] = [uint256(1), uint256(1)];
        b[1] = [uint256(1), uint256(1)];
        c = [uint256(1), uint256(2)];
    }

    function _mockValidProof() internal {
        vm.mockCall(
            address(verifier),
            abi.encodeWithSelector(SettlementVerifier.verifyProof.selector),
            abi.encode(true)
        );
    }
}

/// Groth16 fixture that matches the embedded `SettlementVerifier` VK.
contract SettlementVerifierFixtureTest is Test {
    function test_verifierAcceptsFixtureProof() public {
        SettlementVerifier verifier = new SettlementVerifier();

        uint256[2] memory a = [
            uint256(0x122eacb4245263ecf3ceb995fe2dc1ee7fea8e9124db49bc9ae1771659ff68db),
            uint256(0x2d893a5851d4aa963f1cf02ba4d602d91ee47d68770c494ae145830540eb5816)
        ];
        // Fixture G2 is already be(c1)||be(c0), matching the pairing precompile.
        uint256[2][2] memory b;
        b[0] = [
            uint256(0x2351f19a4cfdfabb3050d0dd65f0b46873bb7c8986ea90be2349fbb539793908),
            uint256(0x0fd8fc7c72f387d3b94a25659c7f68824922ea566749a0f54067c5b0a5f05344)
        ];
        b[1] = [
            uint256(0x13143ac622b5f1f8871ba1ca3f8237c75461360c86a926a6f26df933e0985e71),
            uint256(0x0353948eb685ea713a0edca47a317e7e914101a414e8af77433893f11244be97)
        ];
        uint256[2] memory c = [
            uint256(0x221d0e18964ccb1f29dceb1692162990b782d2f872c90ef1edf83a567ec25d00),
            uint256(0x1b5cb83c8a2b939576d5ec1f6dc4b063c9be0641d2c83364177da33fe1f913c2)
        ];
        uint256[13] memory input = [
            uint256(0x05f48a99),
            uint256(0x02276cb6132cb060f6079ff9d8db7fd9b5b65063ed7a6b0ef041f1d1ea83b6f6),
            uint256(0x01312d00),
            uint256(0x00e2c6b0),
            uint256(0x14c84316b0aaa2ebe985072537aeaa1d3de23690628efc8bacb5b3f4c2fb1438),
            uint256(0x2e84e8713528d685a5862fd7f2988ecb1e3aedc44677deda3b517e665124c6bf),
            uint256(0x1856a2655366be03a9137ba1cc3c4092552eccec3133d5cf90a13200ea1bced3),
            uint256(0x0102030405060708090a0b0c0d0e0f10),
            uint256(0x1112131415161718191a1b1c1d1e1f01),
            uint256(0x0202030405060708090a0b0c0d0e0f10),
            uint256(0x1112131415161718191a1b1c1d1e1f02),
            uint256(0x0302030405060708090a0b0c0d0e0f10),
            uint256(0x1112131415161718191a1b1c1d1e1f03)
        ];

        assertTrue(verifier.verifyProof(a, b, c, input));
    }
}
