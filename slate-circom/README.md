# Slate Circom
It contains the circom circuits and the soroban verifier which runs on-chain

# Quick Start
```sh
node generate_input.js

chmod +x run.sh

./run.sh setttlement
```

For testing purposes, a `generate_input.js` file has been added to generate mock input files. If you add your own inputs, please delete the `verifier-soroban/contracts/meteredverifier/src/fixture.rs` and `verifier-soroban/contracts/meteredverifier/src/vk.rs` and regenerate them using the command
```sh
node verifier-soroban/gen_verifier_data.js
```