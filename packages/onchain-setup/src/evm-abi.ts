/** Minimal ABIs for Base / EVM Slate contracts (generated via `forge inspect`). */

export const slateAgentRegistryAbi = [
  {
    type: "function",
    name: "registerChannel",
    stateMutability: "nonpayable",
    inputs: [
      { name: "channelId", type: "uint256" },
      { name: "rateCommitment", type: "uint256" },
      { name: "consumerPubkeyX", type: "uint256" },
      { name: "consumerPubkeyY", type: "uint256" },
      { name: "depositor", type: "address" },
      { name: "provider", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "validateForSettlement",
    stateMutability: "view",
    inputs: [
      { name: "channelId", type: "uint256" },
      { name: "publicSignals", type: "uint256[13]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "closeChannel",
    stateMutability: "nonpayable",
    inputs: [{ name: "channelId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "hasChannel",
    stateMutability: "view",
    inputs: [{ name: "channelId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getChannel",
    stateMutability: "view",
    inputs: [{ name: "channelId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          {
            name: "record",
            type: "tuple",
            components: [
              { name: "rateCommitment", type: "uint256" },
              { name: "consumerPubkeyX", type: "uint256" },
              { name: "consumerPubkeyY", type: "uint256" },
              { name: "depositor", type: "address" },
              { name: "provider", type: "address" },
              { name: "token", type: "address" },
            ],
          },
          { name: "status", type: "uint8" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
  },
] as const;

export const slateEscrowAbi = [
  {
    type: "function",
    name: "init",
    stateMutability: "nonpayable",
    inputs: [
      { name: "verifier_", type: "address" },
      { name: "registry_", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "whitelistToken",
    stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "addToDepositors",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "token", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getBalance",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "a", type: "uint256[2]" },
      { name: "b", type: "uint256[2][2]" },
      { name: "c", type: "uint256[2]" },
      { name: "publicSignals", type: "uint256[13]" },
      { name: "depositor", type: "address" },
      { name: "provider", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "depositor", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [],
  },
] as const;

export const settlementVerifierAbi = [
  {
    type: "function",
    name: "verifyProof",
    stateMutability: "view",
    inputs: [
      { name: "a", type: "uint256[2]" },
      { name: "b", type: "uint256[2][2]" },
      { name: "c", type: "uint256[2]" },
      { name: "input", type: "uint256[13]" },
    ],
    outputs: [{ name: "r", type: "bool" }],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
