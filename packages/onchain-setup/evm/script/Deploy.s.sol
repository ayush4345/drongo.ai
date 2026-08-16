// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {SettlementVerifier} from "../src/SettlementVerifier.sol";
import {SlateAgentRegistry} from "../src/SlateAgentRegistry.sol";
import {SlateEscrow} from "../src/SlateEscrow.sol";

/**
 * Deploy verifier + registry + escrow, then wire escrow.init.
 *
 *   forge script script/Deploy.s.sol:DeployScript --rpc-url $BASE_RPC_URL --broadcast --private-key $EVM_PRIVATE_KEY
 */
contract DeployScript is Script {
    function run() external {
        address token = vm.envOr("SETTLEMENT_TOKEN_ID", address(0x036CbD53842c5426634e7929541eC2318f3dCF7e));

        vm.startBroadcast();
        SettlementVerifier verifier = new SettlementVerifier();
        SlateAgentRegistry registry = new SlateAgentRegistry();
        SlateEscrow escrow = new SlateEscrow();
        escrow.init(address(verifier), address(registry));
        escrow.whitelistToken(token);
        vm.stopBroadcast();

        console2.log("SettlementVerifier", address(verifier));
        console2.log("SlateAgentRegistry", address(registry));
        console2.log("SlateEscrow", address(escrow));
        console2.log("Whitelisted token", token);
    }
}
