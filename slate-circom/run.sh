#!/bin/bash

set -e

if [ -z "$1" ]; then
  echo "No file given"
  exit 1
fi

CIRCUIT_NAME=$1
# Power must be large enough so that 2^POWER >= number of constraints.
# This circuit (Poseidon + EdDSA) has ~9.7k constraints, so 2^12 is too small.
POWER=15
PTAU_FILE="pot${POWER}_final.ptau"

if [ ! -f "$PTAU_FILE" ]; then
  echo "generating ptau file"

  snarkjs powersoftau new bn128 "$POWER" "pot${POWER}_0000.ptau" -v

  snarkjs powersoftau contribute "pot${POWER}_0000.ptau" "pot${POWER}_0001.ptau" --name="local contribution" -v -e="random_string"

  snarkjs powersoftau prepare phase2 "pot${POWER}_0001.ptau" "$PTAU_FILE" -v

  rm "pot${POWER}_0000.ptau" "pot${POWER}_0001.ptau"
else
  echo "using existing"
fi

echo "1. Compiling circuits"
circom "${CIRCUIT_NAME}.circom" --r1cs --wasm

echo "2. Generating witness"
node "${CIRCUIT_NAME}_js/generate_witness.js" "${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm" input.json witness.wtns

echo "3. circuit specific trusted setup"
snarkjs groth16 setup "${CIRCUIT_NAME}.r1cs" "$PTAU_FILE" "${CIRCUIT_NAME}_0000.zkey"

snarkjs zkey contribute "${CIRCUIT_NAME}_0000.zkey" "${CIRCUIT_NAME}_final.zkey" --name="Final Circuit Contributor" -v -e="another_layer_of_secret_noise"

snarkjs zkey export verificationkey "${CIRCUIT_NAME}_final.zkey" "${CIRCUIT_NAME}_verification_key.json"

echo "4. generating zk proof"
snarkjs groth16 prove "${CIRCUIT_NAME}_final.zkey" witness.wtns proof.json public.json

echo "5. verifying proof"
snarkjs groth16 verify "${CIRCUIT_NAME}_verification_key.json" public.json proof.json
