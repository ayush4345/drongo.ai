#!/usr/bin/env bash
# Build the settlement circuit, run a local Groth16 ceremony, prove a fixture
# witness, and regenerate Soroban verifier + contract test fixtures.
#
# Layout (packages/proving-setup/):
#   circuits/settlement.circom          circuit source
#   settlement_js/settlement.wasm       witness calculator (circom output)
#   settlement.r1cs                     constraint system (gitignored)
#   settlement_final.zkey               proving key (gitignored)
#   settlement_verification_key.json    verifying key (gitignored)
#   fixtures/settlement.input.json      witness input for the test vector
#   artifacts/                          transient ptau / witness / proof files
#
# Outputs written under packages/onchain-setup/soroban/contracts/:
#   meteredverifier/src/vk.rs
#   meteredverifier/src/fixture.rs
#   slate-escrow/src/fixture.rs
#   slate-agent-registry/src/fixture.rs

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

CIRCUIT="settlement"
CIRCUIT_SRC="circuits/${CIRCUIT}.circom"
ARTIFACTS_DIR="artifacts"
FIXTURES_DIR="fixtures"
WASM_DIR="${CIRCUIT}_js"

R1CS="${CIRCUIT}.r1cs"
ZKEY_INTERMEDIATE="${ARTIFACTS_DIR}/${CIRCUIT}_0000.zkey"
ZKEY_FINAL="${CIRCUIT}_final.zkey"
VKEY="${CIRCUIT}_verification_key.json"
WASM="${WASM_DIR}/${CIRCUIT}.wasm"
INPUT_JSON="${FIXTURES_DIR}/${CIRCUIT}.input.json"
PROOF_JSON="${ARTIFACTS_DIR}/proof.json"
PUBLIC_JSON="${ARTIFACTS_DIR}/public.json"

POWER=15
PTAU_FILE="${ARTIFACTS_DIR}/pot${POWER}_final.ptau"

ONCHAIN_ROOT="${ROOT}/../onchain-setup/soroban/contracts"

mkdir -p "$ARTIFACTS_DIR" "$FIXTURES_DIR"

if ! command -v circom >/dev/null 2>&1; then
  echo "error: circom is not installed (https://docs.circom.io/getting-started/installation/)" >&2
  exit 1
fi

if ! command -v snarkjs >/dev/null 2>&1; then
  echo "error: snarkjs is not installed (npm install -g snarkjs)" >&2
  exit 1
fi

echo "=== 0. Fixture witness input ==="
if [ ! -f "$INPUT_JSON" ]; then
  echo "writing ${INPUT_JSON} via scripts/write-fixture-input.mjs"
  pnpm --filter @drongo/proving-setup build
  node scripts/write-fixture-input.mjs
else
  echo "using existing ${INPUT_JSON}"
fi

echo "=== 1. Powers of Tau (local ceremony) ==="
if [ ! -f "$PTAU_FILE" ]; then
  snarkjs powersoftau new bn128 "$POWER" "${ARTIFACTS_DIR}/pot${POWER}_0000.ptau" -v
  snarkjs powersoftau contribute \
    "${ARTIFACTS_DIR}/pot${POWER}_0000.ptau" \
    "${ARTIFACTS_DIR}/pot${POWER}_0001.ptau" \
    --name="local contribution" -v -e="random_string"
  snarkjs powersoftau prepare phase2 \
    "${ARTIFACTS_DIR}/pot${POWER}_0001.ptau" \
    "$PTAU_FILE" -v
  rm -f "${ARTIFACTS_DIR}/pot${POWER}_0000.ptau" "${ARTIFACTS_DIR}/pot${POWER}_0001.ptau"
else
  echo "using existing ${PTAU_FILE}"
fi

ensure_settlement_js_commonjs() {
  # Circom emits CommonJS witness helpers. The parent package is ESM
  # ("type": "module"), so settlement_js needs its own package boundary.
  cat > "${WASM_DIR}/package.json" <<'EOF'
{
  "type": "commonjs"
}
EOF
}

echo "=== 2. Compile circuit ==="
circom "$CIRCUIT_SRC" --r1cs --wasm -o .
ensure_settlement_js_commonjs

echo "=== 3. Groth16 circuit setup ==="
snarkjs groth16 setup "$R1CS" "$PTAU_FILE" "$ZKEY_INTERMEDIATE"
snarkjs zkey contribute "$ZKEY_INTERMEDIATE" "$ZKEY_FINAL" \
  --name="Final Circuit Contributor" -v -e="another_layer_of_secret_noise"
rm -f "$ZKEY_INTERMEDIATE"
snarkjs zkey export verificationkey "$ZKEY_FINAL" "$VKEY"

echo "=== 4. Prove + verify (snarkjs) ==="
# fullprove avoids circom's CommonJS generate_witness.js under an ESM package.
snarkjs groth16 fullprove "$INPUT_JSON" "$WASM" "$ZKEY_FINAL" "$PROOF_JSON" "$PUBLIC_JSON"
snarkjs groth16 verify "$VKEY" "$PUBLIC_JSON" "$PROOF_JSON"

echo "=== 5. Generate Soroban verifier + contract fixtures ==="
node scripts/gen_verifier_data.js \
  --vkey "$VKEY" \
  --proof "$PROOF_JSON" \
  --public "$PUBLIC_JSON" \
  --out-dir "$ONCHAIN_ROOT"

echo "Done."
echo "  wasm:     ${WASM}"
echo "  zkey:     ${ZKEY_FINAL}"
echo "  vkey:     ${VKEY}"
echo "  vk.rs:    ${ONCHAIN_ROOT}/meteredverifier/src/vk.rs"
