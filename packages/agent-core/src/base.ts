import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Account,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import {
  payloadToEvmAddress,
  type AddressPayload,
  type PackedProof,
  type SerializedSettlement,
} from "@drongo/proving-setup";
import { assertBaseConfig, type BaseConfig } from "@drongo/onchain-setup";
import { erc20Abi, slateAgentRegistryAbi, slateEscrowAbi } from "@drongo/onchain-setup";
import type { ChainClient, OpenChannelArgs, SettleArgs } from "./chain.js";

export interface BaseChainClientOptions {
  config: BaseConfig;
  /** Depositor EOA — signs register + approve + deposit. */
  account: Account;
  /** Optional custom clients (tests). */
  publicClient?: PublicClient;
  walletClient?: WalletClient;
}

type EvmCallProof = {
  a: readonly [bigint, bigint];
  b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
  c: readonly [bigint, bigint];
  publicSignals: readonly [
    bigint, bigint, bigint, bigint, bigint, bigint, bigint,
    bigint, bigint, bigint, bigint, bigint, bigint,
  ];
};

function assertEscrowAmount(amount: bigint): void {
  if (amount <= 0n) {
    throw new Error(`escrow amount must be positive, received ${amount}`);
  }
}

function resolveAddress(payload: AddressPayload): `0x${string}` {
  if (typeof payload === "string" && /^0x[0-9a-fA-F]{40}$/.test(payload)) {
    return payload as `0x${string}`;
  }
  return payloadToEvmAddress(payload);
}

function chainForId(chainId: number): Chain {
  if (chainId === base.id) return base;
  if (chainId === baseSepolia.id) return baseSepolia;
  return {
    ...baseSepolia,
    id: chainId,
    name: `evm-${chainId}`,
    rpcUrls: { default: { http: [] } },
  };
}

function bytesToBigIntBE(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

/**
 * Convert the packed byte proof layout into Solidity verifyProof args.
 * Layout is Ethereum-compatible (G1 be(X)||be(Y); G2 be(c1)||be(c0)).
 */
export function packedProofToEvm(proof: PackedProof): Omit<EvmCallProof, "publicSignals"> {
  if (proof.a.length !== 64 || proof.b.length !== 128 || proof.c.length !== 64) {
    throw new Error(
      `unexpected proof byte lengths a=${proof.a.length} b=${proof.b.length} c=${proof.c.length}`,
    );
  }
  return {
    a: [bytesToBigIntBE(proof.a.subarray(0, 32)), bytesToBigIntBE(proof.a.subarray(32, 64))],
    b: [
      [bytesToBigIntBE(proof.b.subarray(0, 32)), bytesToBigIntBE(proof.b.subarray(32, 64))],
      [bytesToBigIntBE(proof.b.subarray(64, 96)), bytesToBigIntBE(proof.b.subarray(96, 128))],
    ],
    c: [bytesToBigIntBE(proof.c.subarray(0, 32)), bytesToBigIntBE(proof.c.subarray(32, 64))],
  };
}

function toEvmSettleArgs(settlement: SerializedSettlement): EvmCallProof {
  if (settlement.publicSignals.length !== 13) {
    throw new Error(`expected 13 public signals, received ${settlement.publicSignals.length}`);
  }
  return {
    ...packedProofToEvm(settlement.proof),
    publicSignals: settlement.publicSignals as unknown as EvmCallProof["publicSignals"],
  };
}

/**
 * Real Base settlement via the Solidity ports of slate-escrow / registry.
 * Address payloads must be 32-byte left-padded EVM addresses (Option A).
 */
export class BaseChainClient implements ChainClient {
  private readonly config: BaseConfig;
  private readonly account: Account;
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;

  constructor(options: BaseChainClientOptions) {
    assertBaseConfig(options.config);
    this.config = options.config;
    this.account = options.account;

    const chain = chainForId(options.config.chainId);
    const transport: Transport = http(options.config.rpcUrl);

    this.publicClient =
      options.publicClient ??
      createPublicClient({
        chain,
        transport,
      });

    this.walletClient =
      options.walletClient ??
      createWalletClient({
        account: options.account,
        chain,
        transport,
      });
  }

  async openChannel(args: OpenChannelArgs): Promise<{ channelId: string; openTx: string }> {
    assertEscrowAmount(args.escrow);

    const depositor = resolveAddress(args.depositor);
    const provider = resolveAddress(args.provider);
    const token = resolveAddress(args.token);

    if (depositor.toLowerCase() !== this.account.address.toLowerCase()) {
      throw new Error(
        `depositor payload ${depositor} does not match signer ${this.account.address}`,
      );
    }

    const registerHash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: chainForId(this.config.chainId),
      to: this.config.slateAgentRegistryAddress,
      data: encodeFunctionData({
        abi: slateAgentRegistryAbi,
        functionName: "registerChannel",
        args: [
          args.channelId,
          args.rateCommitment,
          args.consumerPublicKey.x,
          args.consumerPublicKey.y,
          depositor,
          provider,
          token,
        ],
      }),
    });
    await this.publicClient.waitForTransactionReceipt({ hash: registerHash });

    const allowance = (await this.publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [depositor, this.config.slateEscrowAddress],
    })) as bigint;

    if (allowance < args.escrow) {
      const approveHash = await this.walletClient.sendTransaction({
        account: this.account,
        chain: chainForId(this.config.chainId),
        to: token,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [this.config.slateEscrowAddress, args.escrow],
        }),
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    const depositHash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: chainForId(this.config.chainId),
      to: this.config.slateEscrowAddress,
      data: encodeFunctionData({
        abi: slateEscrowAbi,
        functionName: "addToDepositors",
        args: [depositor, args.escrow, token],
      }),
    });
    await this.publicClient.waitForTransactionReceipt({ hash: depositHash });

    return {
      channelId: args.channelId.toString(),
      openTx: `${registerHash},${depositHash}`,
    };
  }

  async settle(args: SettleArgs): Promise<{ settleTx: string }> {
    const depositor = resolveAddress(args.depositor);
    const provider = resolveAddress(args.provider);
    const token = resolveAddress(args.token);
    const { a, b, c, publicSignals } = toEvmSettleArgs(args.settlement);

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: chainForId(this.config.chainId),
      to: this.config.slateEscrowAddress,
      data: encodeFunctionData({
        abi: slateEscrowAbi,
        functionName: "settle",
        args: [a, b, c, publicSignals, depositor, provider, token],
      }),
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return { settleTx: hash };
  }
}

export function accountFromPrivateKey(privateKey: Hex | string): Account {
  const key = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex;
  return privateKeyToAccount(key);
}
