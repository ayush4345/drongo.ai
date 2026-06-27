# slate

Privacy-preserving **metered payment channels** on Stellar/Soroban. A consumer
funds an escrow, meters usage off-chain against a committed rate, and settles by
submitting a zero-knowledge proof — the provider is paid the metered amount and
the depositor refunded the remainder, without revealing the rate or usage.

The system is built from a Circom settlement circuit, a Groth16 verifier and two
stateful contracts on Soroban, plus a TypeScript proving/serialization toolkit.

---

## Repository layout

```
packages/
├── proving-setup/            @drongo/proving-setup — TS proving toolkit
│   ├── circuits/settlement.circom        the metered-settlement circuit
│   ├── settlement_js/settlement.wasm      compiled witness calculator
│   ├── settlement_final.zkey              Groth16 proving key
│   ├── settlement_verification_key.json   verifying key
│   └── src/
│       ├── index.ts          generateSettlementProof + validation
│       ├── inputs.ts         voucher / circuit-input builders
│       └── serialize.ts      snarkjs proof → Soroban byte layout
│
└── onchain-setup/            @drongo/onchain-setup — Soroban contracts
    └── soroban/contracts/
        ├── meteredverifier/      Groth16 / BN254 proof verifier (embeds vk.rs)
        ├── slate-escrow/         holds funds, verifies proofs, settles
        └── slate-agent-registry/ channel identity + lifecycle
```

### Component responsibilities

| Component | Role |
|---|---|
| `settlement.circom` | Proves a settlement is honest: rate commitment, EdDSA voucher, `settlement = total_units · rate`, `settlement ≤ escrow`, nullifier. |
| `meteredverifier` | Pure Groth16/BN254 pairing check against an embedded verifying key. No state, no funds. |
| `slate-escrow` | Custodies deposits, cross-calls the verifier, enforces amounts + nullifier replay protection, pays out. |
| `slate-agent-registry` | Stores the fixed per-channel parameters (identities, rate commitment, pubkey) and open/closed status. |
| `proving-setup` | Builds vouchers and circuit inputs, generates proofs, and serializes them into the contract byte layout. |

---

## Public signal layout

The circuit exposes **13 public signals**, in this order. The same indices are
used by every contract and by the serializer.

| Idx | Signal | Bound | Used by |
|----|--------|-------|---------|
| 0 | `channel_id` | field | registry |
| 1 | `rate_commitment` | field | registry |
| 2 | `escrow_amount` | < 2⁶⁴ | escrow |
| 3 | `settlement_amount` | < 2⁶⁴ | escrow |
| 4 | `nullifier` | field | escrow |
| 5–6 | `consumer_pubkey_x/y` | field | registry |
| 7–8 | `depositor_hi/lo` | < 2¹²⁸ | escrow + registry |
| 9–10 | `provider_hi/lo` | < 2¹²⁸ | escrow + registry |
| 11–12 | `token_hi/lo` | < 2¹²⁸ | escrow + registry |

Soroban addresses are 32-byte payloads split into two 128-bit limbs
(`hi = bytes[0..16]`, `lo = bytes[16..32]`, big-endian) so they fit the BN254
scalar field.

---

## Technical logic flow

### Phase 0 — Build & deploy (one-time)

```
# build-time (proving-setup)
circom settlement.circom   → settlement.r1cs, settlement_js/settlement.wasm
groth16 setup + ceremony   → settlement_final.zkey, settlement_verification_key.json
./run.sh                     → full local pipeline (see packages/proving-setup/run.sh)
gen_verifier_data.js       → packages/proving-setup/scripts/gen_verifier_data.js
                           → meteredverifier/src/vk.rs (+ test fixtures)

# deploy (onchain-setup)
deploy meteredverifier                 → verifierAddr
deploy slate-agent-registry            → registryAddr
deploy slate-escrow ; escrow.init(verifierAddr, registryAddr)
escrow.whitelist_token(tokenAddr)
```

The proving key and the verifier's embedded `vk.rs` come from the same ceremony,
so a proof made from `settlement_final.zkey` verifies under `meteredverifier`.

### Phase 1 — Open & fund a channel (depositor)

```
registry.register_channel(channel_id, rate_commitment,
                          consumer_pubkey_x, consumer_pubkey_y,
                          depositor, provider, token)   // depositor.require_auth()
escrow.add_to_depositors(depositor, amount, token)      // pulls tokens into escrow
```

`rate_commitment` must equal `Poseidon(rate, rate_blind)` — computable client-side
with `computeRateCommitment(rate, rateBlind)`.

### Phase 2 — Metering voucher (consumer, off-chain)

The consumer signs a usage voucher; their private key never leaves their side.

```ts
const voucher = await createVoucher(consumerPrivateKey, channelId, totalUnits);
// → { message = Poseidon(channelId, totalUnits),
//     consumerPublicKey: { x, y },
//     signature: { R8x, R8y, S } }              // EdDSA-Poseidon (Baby Jubjub)
```

The consumer hands `{ consumerPublicKey, signature, totalUnits }` to the prover.

### Phase 3 — Assemble circuit inputs (prover)

```ts
const inputs = await buildSettlementInputs({
  channelId, channelSecret, rate, rateBlind, totalUnits, escrowAmount,
  depositorPayload, providerPayload, tokenPayload,        // 32-byte payloads
  voucher: { consumerPublicKey, signature },              // or consumerPrivateKey
});
```

`buildSettlementInputs` computes `settlement_amount = totalUnits · rate`, the
Poseidon `rate_commitment` and `nullifier`, splits the three addresses into
limbs (`addressPayloadToLimbs`), **verifies the supplied voucher**
(`verifyVoucher`, throws `InputBuildError` on mismatch), and returns the full
20-field input object (13 public + 7 private witnesses).

### Phase 4 — Validate & prove

```ts
const { proof, publicSignals } = await generateSettlementProof(inputs);
```

- `validateSettlementInputs` (called internally) checks structure, types, ranges,
  and the arithmetic relations, aggregating every problem into one
  `CircuitInputValidationError`.
- `snarkjs.groth16.fullProve(witness, settlement.wasm, settlement_final.zkey)`
  generates the witness — which enforces the cryptographic constraints (rate
  commitment, EdDSA voucher, nullifier) — and the proof. Failures surface as a
  descriptive `ProofGenerationError`.

### Phase 5 — Serialize for the chain

```ts
const { proof: pBytes, publicSignals: sigs } = serializeSettlement({ proof, publicSignals });
// pBytes = { a: Uint8Array(64), b: Uint8Array(128), c: Uint8Array(64) }   // G2 c1||c0 swapped
// sigs   = bigint[13]                                                       // → Vec<U256>
```

G1 points encode as `be(X) || be(Y)`; the G2 point as `be(X) || be(Y)` with each
Fp2 element as `be(c1) || be(c0)` (snarkjs stores `[c0, c1]`, so the components
are swapped). This matches `gen_verifier_data.js`, the encoder the deployed
verifying key was produced with.

### Phase 6 — Submit settlement

```
escrow.settle(Proof{a,b,c}, public_signals[13], depositor, provider, token)
```

Inside `slate-escrow.settle`, in order:

1. `public_signals.len() == 13`.
2. Assert call-arg `depositor` / `provider` / `token` equal signals 7–12.
3. Cross-call `registry.validate_for_settlement(channel_id, public_signals)`
   — channel must be registered and open; signals 0, 1, 5–12 must match the
   stored record.
4. Cross-call `meteredverifier.verify(proof, public_signals)`
   — reconstruct `vk_x = IC[0] + Σ signals[i]·IC[i+1]`, then
   `pairing_check(e(−A,B)·e(α,β)·e(vk_x,γ)·e(C,δ)) == 1`.
5. Extract `escrow_amount` (2), `settlement_amount` (3), `nullifier` (4);
   require `settlement ≤ escrow`.
6. Reject a spent `nullifier`, else mark it spent (replay protection).
7. Debit the depositor's balance by `escrow_amount`.
8. Transfer `settlement_amount → provider` and `escrow_amount − settlement_amount → depositor`.

### Phase 7 — Wind down

```
escrow.refund(depositor, token)             // withdraw remaining balance
registry.close_channel(channel_id, caller)  // depositor or provider
```

### Call graph

```
consumer:  createVoucher ─────────────► { pubkey, signature }
                                              │
prover:    buildSettlementInputs ◄────────────┘
                │  (compute* + addressPayloadToLimbs + verifyVoucher)
                ▼
           generateSettlementProof ──► { proof, publicSignals[13] }
                │  (validateSettlementInputs + snarkjs.fullProve)
                ▼
           serializeSettlement ──────► { a/b/c bytes, bigint[13] }
                │
submitter:      ▼
           escrow.settle ──► assert addresses ──► registry.validate_for_settlement ──► meteredverifier.verify ──► pay out
```

---

## Development

Each package builds with TypeScript project references:

```bash
# proving-setup
pnpm --filter @drongo/proving-setup build

# Soroban contracts
cd packages/onchain-setup/soroban && cargo test
```
