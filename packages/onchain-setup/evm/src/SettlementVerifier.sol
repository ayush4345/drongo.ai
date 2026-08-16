// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/**
 * @title SettlementVerifier
 * @notice Groth16 / BN254 verifier for the slate settlement circuit (nPublic=13).
 * @dev VK constants from settlement_verification_key.json. Prefer
 *      `snarkjs zkey export solidityverifier` once settlement_final.zkey is available.
 */
library Pairing {
    struct G1Point {
        uint256 X;
        uint256 Y;
    }

    struct G2Point {
        uint256[2] X;
        uint256[2] Y;
    }

    function P1() internal pure returns (G1Point memory) {
        return G1Point(1, 2);
    }

    function P2() internal pure returns (G2Point memory) {
        return G2Point(
            [
                10857046999023057135944570762232829481370756359578518086990519993285655852781,
                11559732032986387107991004021392285783925812861821192530917403151452391805634
            ],
            [
                8495653923123431417604977125428555279799625030185156653228100201019764567859,
                4082367875863433681332203403145435568316851327593401208105741076214120093531
            ]
        );
    }

    function negate(G1Point memory p) internal pure returns (G1Point memory) {
        uint256 q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
        if (p.X == 0 && p.Y == 0) return G1Point(0, 0);
        return G1Point(p.X, q - (p.Y % q));
    }

    function addition(G1Point memory p1, G1Point memory p2) internal view returns (G1Point memory r) {
        uint256[4] memory input;
        input[0] = p1.X;
        input[1] = p1.Y;
        input[2] = p2.X;
        input[3] = p2.Y;
        bool success;
        assembly {
            success := staticcall(sub(gas(), 2000), 6, input, 0xc0, r, 0x60)
            switch success case 0 { invalid() }
        }
        require(success, "pairing-add-failed");
    }

    function scalar_mul(G1Point memory p, uint256 s) internal view returns (G1Point memory r) {
        uint256[3] memory input;
        input[0] = p.X;
        input[1] = p.Y;
        input[2] = s;
        bool success;
        assembly {
            success := staticcall(sub(gas(), 2000), 7, input, 0x80, r, 0x60)
            switch success case 0 { invalid() }
        }
        require(success, "pairing-mul-failed");
    }

    function pairing(G1Point memory a1, G2Point memory a2, G1Point memory b1, G2Point memory b2, G1Point memory c1, G2Point memory c2, G1Point memory d1, G2Point memory d2)
        internal
        view
        returns (bool)
    {
        uint256[24] memory input;
        input[0] = a1.X;
        input[1] = a1.Y;
        input[2] = a2.X[0];
        input[3] = a2.X[1];
        input[4] = a2.Y[0];
        input[5] = a2.Y[1];
        input[6] = b1.X;
        input[7] = b1.Y;
        input[8] = b2.X[0];
        input[9] = b2.X[1];
        input[10] = b2.Y[0];
        input[11] = b2.Y[1];
        input[12] = c1.X;
        input[13] = c1.Y;
        input[14] = c2.X[0];
        input[15] = c2.X[1];
        input[16] = c2.Y[0];
        input[17] = c2.Y[1];
        input[18] = d1.X;
        input[19] = d1.Y;
        input[20] = d2.X[0];
        input[21] = d2.X[1];
        input[22] = d2.Y[0];
        input[23] = d2.Y[1];
        uint256[1] memory out;
        bool success;
        assembly {
            success := staticcall(sub(gas(), 2000), 8, input, 0x300, out, 0x20)
            switch success case 0 { invalid() }
        }
        require(success, "pairing-opcode-failed");
        return out[0] != 0;
    }
}

contract SettlementVerifier {
    using Pairing for *;

    struct VerifyingKey {
        Pairing.G1Point alfa1;
        Pairing.G2Point beta2;
        Pairing.G2Point gamma2;
        Pairing.G2Point delta2;
        Pairing.G1Point[14] IC;
    }

    struct Proof {
        Pairing.G1Point A;
        Pairing.G2Point B;
        Pairing.G1Point C;
    }

    function verifyingKey() internal pure returns (VerifyingKey memory vk) {
        vk.alfa1 = Pairing.G1Point(0x2b3575f18ae2a46f62ed89119cf5b4e67d5ca9e85d58e9d4da706fc80dd2bb63,0x1de9c153a0aa0906a44a6b17f5e11988458de5ebc39c0fa4dbd65f2e9b2c26ce);
        vk.beta2 = Pairing.G2Point(
            [0x1f95035213016933fdb00041218976b863a7a2dea82863bf1444bd8134b9b77c,0x1a66955f5fe8b7350887b852d2a5abefa9d8e222fef6e956bf02c7ecd7b92823],
            [0x2a021a046fbc54fd2cc0e7c1b18761f623ce35b5d2620ffd84bf5e2d94b49692,0x1147bed4f51c6001825a0ec0371b9426488adc72d0a357fb55dd8bda792d6bdc]
        );
        vk.gamma2 = Pairing.G2Point(
            [0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2,0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed],
            [0x90689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b,0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa]
        );
        vk.delta2 = Pairing.G2Point(
            [0x1d89e0a0ddf797cbc144f05db1f138ca24bd135552f36abba72307fed627e818,0x1b0fa234138ef5cfa7a70b8434f6f65c35987019c68e3dcb57f830860b5e5c6d],
            [0x22240e52a0dc8eaf616400db1fced7758d55665ccd10e3645e58ee1f3b6d6670,0x9aceb295a773cf7d2291159cffefb7f1324436a458df56cc4e4f082e8876e63]
        );
        vk.IC[0] = Pairing.G1Point(0x2dd1e24ddee881bb34e59d297e99653630cacf78d7ba37f33139cd26dc22ffcf,0xc734b3a14af7500f5a5b9f224e4f6a492abf9164e420fcae61970c727e35246);
        vk.IC[1] = Pairing.G1Point(0x89a658b184ce30161c1b194320e3b26a05ebb633ea9c8f344c48dfc9b5c5b8,0x13867f83923f55e33af0c17c1d2b618187a281ef49ac6d1d097d744ce7730ea1);
        vk.IC[2] = Pairing.G1Point(0x2ab7d610153a4ecfce1a97fc70883b155040e300d288aebb9338d8e0a6e5beb7,0x2b489f55ba0176d7d985609b6411c65f9af2acf67e52b58c5045bab799a62505);
        vk.IC[3] = Pairing.G1Point(0x19d7dc7ad71b953098e09db9c0b5993cc50a495cf371b7f49998424f5a2351d7,0x1500ca0cfcb27f5545d5ce89cb9c94bf883714152dd7520b7a1d04c2827c3369);
        vk.IC[4] = Pairing.G1Point(0x21fe5114c6741d1d6b34300cbf307c0fb568d1c6e054d6496d9b5a8a38f8487,0xff2384a26ed1cf4ebaf6fee596fda915b0e9525359d67bb3800166c81f61865);
        vk.IC[5] = Pairing.G1Point(0x2315cbed929a901a6c8fb104fa96c48f7e614cb2b2dc278c41407a161ea3e8b2,0x2256c3c192060cb53738c9698c1dbfc57fe55cd8087bf12fe6c20fcd3185a23a);
        vk.IC[6] = Pairing.G1Point(0x2e65c5da7c8671a14b29e7f4349f135c342c22e61fc23748e1c2fddfd414b515,0x2d90743f7d115ffb150222998238f70c94a6463be21fd4e7594dcce388e347c5);
        vk.IC[7] = Pairing.G1Point(0x2b87e6cb5b8fe23c6c8d212f8f288ae51645a0eb8e7f2027e624d48452fd182e,0x16a240ce91b0d192e625a934bd3366c9723d4af7de2edf092890c360cb88b340);
        vk.IC[8] = Pairing.G1Point(0x2a0822d7a4edfee22ade4f508c78f1a6a174af85b30aad966990d7450151403c,0x14c4eb8146b9e1b20078ff135ba77de4c53811684e39e5a85ac9e360de1e3213);
        vk.IC[9] = Pairing.G1Point(0x99f5ae7cc35350af58d02baeabcbd24ca315545ec51562b8f04b1ff03b53265,0x1a9fa7247d07fef95ff2c3a87fd28459a5ac5150ea96c600bab0add4ce3b6ed3);
        vk.IC[10] = Pairing.G1Point(0x1df99e43952a24b6ef58b9f9e8ae945209e756bd7efd4893f1e78a5bd3421989,0xe268ff9ab7c3770a91eddbd012f5d3fa24992b359de6e380522d88b046c9734);
        vk.IC[11] = Pairing.G1Point(0x11e18d4fddb60f3b44e7d02bfa3967708728a6662e6efa30792f93ce4d6d80d2,0x495320b0ed071d9753e4728cd172d527e8b5cb73dd4dadc2eacaf1b53488cae);
        vk.IC[12] = Pairing.G1Point(0x2bb88da47d438a72437a9d0b9a1c6e39a0019820f246bfe8433f59d03d1fba10,0xd7c52eeae5e262b3253a25b34a03ba4d14c702cee47bf33a5d2d3eeb3859a3c);
        vk.IC[13] = Pairing.G1Point(0x323c06cc3333c015296ae98bb1e1ec32204269869f9edd42dc84201beadec7,0x18feec214b8896262948efd31bba33c66d33f247948fa7bf9ed188f6295c2bb9);
    }

    function verify(uint256[13] memory input, Proof memory proof) internal view returns (uint256) {
        uint256 snark_scalar_field = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        VerifyingKey memory vk = verifyingKey();
        require(input.length + 1 == vk.IC.length, "verifier-bad-input");
        Pairing.G1Point memory vk_x = Pairing.G1Point(0, 0);
        for (uint256 i = 0; i < input.length; i++) {
            require(input[i] < snark_scalar_field, "verifier-gte-snark-scalar-field");
            vk_x = Pairing.addition(vk_x, Pairing.scalar_mul(vk.IC[i + 1], input[i]));
        }
        vk_x = Pairing.addition(vk_x, vk.IC[0]);
        if (
            !Pairing.pairing(
                Pairing.negate(proof.A),
                proof.B,
                vk.alfa1,
                vk.beta2,
                vk_x,
                vk.gamma2,
                proof.C,
                vk.delta2
            )
        ) return 1;
        return 0;
    }

    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[13] calldata input
    ) public view returns (bool r) {
        Proof memory proof;
        proof.A = Pairing.G1Point(a[0], a[1]);
        proof.B = Pairing.G2Point([b[0][0], b[0][1]], [b[1][0], b[1][1]]);
        proof.C = Pairing.G1Point(c[0], c[1]);
        return verify(input, proof) == 0;
    }
}
