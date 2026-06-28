import { Buffer } from "buffer";
import type { AddressPayload, ConsumerPublicKey, SerializedSettlement } from "@drongo/proving-setup";
import {
  assertSorobanConfig,
  SlateAgentRegistryClient,
  SlateEscrowClient,
  type SorobanConfig,
} from "@drongo/onchain-setup";
import { Address, Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import type { ClientOptions } from "@stellar/stellar-sdk/contract";

/**
 * The on-chain seam. Opening a channel = `slate-agent-registry.register_channel`
 * + `slate-escrow.add_to_depositors`; closing = `slate-escrow.settle`. Agents
 * depend on this interface, not on a concrete chain, so the metering/proving
 * loop is testable without a deployed contract.
 */
export interface OpenChannelArgs {
  channelId: bigint;
  rateCommitment: bigint;
  consumerPublicKey: ConsumerPublicKey;
  depositor: AddressPayload;
  provider: AddressPayload;
  token: AddressPayload;
  /** Escrow to lock, in micro-USDC. */
  escrow: bigint;
}

export interface SettleArgs {
  settlement: SerializedSettlement;
  depositor: AddressPayload;
  provider: AddressPayload;
  token: AddressPayload;
}

export interface ChainClient {
  openChannel(args: OpenChannelArgs): Promise<{ channelId: string; openTx: string }>;
  settle(args: SettleArgs): Promise<{ settleTx: string }>;
}

/** Whether a 32-byte address payload is an account (G…) or contract (C…). */
export type StellarAddressKind = "account" | "contract";

export interface SorobanChainClientOptions {
  config: SorobanConfig;
  /** Signs `register_channel` and `add_to_depositors`. */
  depositorKeypair: Keypair;
  /** Signs `settle`; defaults to `depositorKeypair`. */
  settleKeypair?: Keypair;
  /** How to decode 32-byte payloads when they are not already G/C strkeys. */
  addressKinds?: {
    depositor?: StellarAddressKind;
    provider?: StellarAddressKind;
    token?: StellarAddressKind;
  };
}

function shortHex(value: bigint): string {
  return value.toString(16).slice(0, 10);
}

function payloadBytes(payload: AddressPayload): Uint8Array {
  if (payload instanceof Uint8Array) {
    if (payload.length !== 32) {
      throw new Error(`address payload must be 32 bytes, received ${payload.length}`);
    }
    return payload;
  }
  if (/^[GC][A-Z2-7]{55}$/.test(payload)) {
    return Address.fromString(payload).toBuffer();
  }
  const hex = payload.startsWith("0x") || payload.startsWith("0X") ? payload.slice(2) : payload;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`address payload must be a G/C strkey or 64 hex characters, received "${payload}"`);
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function addressPayloadToStellarAddress(
  payload: AddressPayload,
  kind: StellarAddressKind,
): string {
  if (typeof payload === "string" && /^[GC][A-Z2-7]{55}$/.test(payload)) {
    return payload;
  }
  const bytes = Buffer.from(payloadBytes(payload));
  return kind === "contract" ? Address.contract(bytes).toString() : Address.account(bytes).toString();
}

function signedClientOptions(
  config: SorobanConfig,
  contractId: string,
  keypair: Keypair,
): ClientOptions {
  return {
    contractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    publicKey: keypair.publicKey(),
    ...basicNodeSigner(keypair, config.networkPassphrase),
  };
}

function toEscrowProof(settlement: SerializedSettlement) {
  return {
    a: Buffer.from(settlement.proof.a),
    b: Buffer.from(settlement.proof.b),
    c: Buffer.from(settlement.proof.c),
  };
}

function assertEscrowAmount(amount: bigint): void {
  const max = (1n << 127n) - 1n;
  if (amount <= 0n || amount > max) {
    throw new Error(`escrow amount must be a positive i128, received ${amount}`);
  }
}

/**
 * In-memory chain for local demos and tests. It does NOT touch Stellar — it just
 * records the calls so the request -> meter -> prove -> settle loop runs
 * end-to-end offline. Swap in {@link SorobanChainClient} for real settlement.
 */
export class MockChainClient implements ChainClient {
  async openChannel(args: OpenChannelArgs): Promise<{ channelId: string; openTx: string }> {
    return {
      channelId: args.channelId.toString(),
      openTx: `mock_open_${shortHex(args.channelId)}`,
    };
  }

  async settle(args: SettleArgs): Promise<{ settleTx: string }> {
    const nullifier = args.settlement.publicSignals[4] ?? 0n;
    return { settleTx: `mock_settle_${shortHex(nullifier)}` };
  }
}

/**
 * Real Stellar settlement via the Soroban contracts in `@drongo/onchain-setup`.
 * Requires deployed contract IDs, a funded depositor keypair, and Stellar
 * addresses that match the 32-byte payloads embedded in settlement proofs.
 */
export class SorobanChainClient implements ChainClient {
  private readonly config: SorobanConfig;
  private readonly depositorKeypair: Keypair;
  private readonly settleKeypair: Keypair;
  private readonly addressKinds: {
    depositor: StellarAddressKind;
    provider: StellarAddressKind;
    token: StellarAddressKind;
  };

  constructor(options: SorobanChainClientOptions) {
    assertSorobanConfig(options.config);
    this.config = options.config;
    this.depositorKeypair = options.depositorKeypair;
    this.settleKeypair = options.settleKeypair ?? options.depositorKeypair;
    this.addressKinds = {
      depositor: options.addressKinds?.depositor ?? "account",
      provider: options.addressKinds?.provider ?? "account",
      token: options.addressKinds?.token ?? "contract",
    };
  }

  async openChannel(args: OpenChannelArgs): Promise<{ channelId: string; openTx: string }> {
    assertEscrowAmount(args.escrow);

    const depositor = addressPayloadToStellarAddress(args.depositor, this.addressKinds.depositor);
    const provider = addressPayloadToStellarAddress(args.provider, this.addressKinds.provider);
    const token = addressPayloadToStellarAddress(args.token, this.addressKinds.token);

    const registry = new SlateAgentRegistryClient(
      signedClientOptions(this.config, this.config.slateAgentRegistryId, this.depositorKeypair),
    );
    const registerTx = await registry.register_channel({
      channel_id: args.channelId,
      rate_commitment: args.rateCommitment,
      consumer_pubkey_x: args.consumerPublicKey.x,
      consumer_pubkey_y: args.consumerPublicKey.y,
      depositor,
      provider,
      token,
    });
    const registerSent = await registerTx.signAndSend();

    const escrow = new SlateEscrowClient(
      signedClientOptions(this.config, this.config.slateEscrowId, this.depositorKeypair),
    );
    const depositTx = await escrow.add_to_depositors({
      address: depositor,
      amount: args.escrow,
      token_address: token,
    });
    const depositSent = await depositTx.signAndSend();

    const registerHash = registerSent.sendTransactionResponse?.hash;
    const depositHash = depositSent.sendTransactionResponse?.hash;
    if (!registerHash || !depositHash) {
      throw new Error("openChannel transactions submitted without a hash");
    }

    return {
      channelId: args.channelId.toString(),
      openTx: `${registerHash},${depositHash}`,
    };
  }

  async settle(args: SettleArgs): Promise<{ settleTx: string }> {
    const depositor = addressPayloadToStellarAddress(args.depositor, this.addressKinds.depositor);
    const provider = addressPayloadToStellarAddress(args.provider, this.addressKinds.provider);
    const token = addressPayloadToStellarAddress(args.token, this.addressKinds.token);

    const escrow = new SlateEscrowClient(
      signedClientOptions(this.config, this.config.slateEscrowId, this.settleKeypair),
    );
    const settleTx = await escrow.settle({
      proof: toEscrowProof(args.settlement),
      public_signals: args.settlement.publicSignals,
      depositor,
      provider,
      token,
    });
    const sent = await settleTx.signAndSend();
    const hash = sent.sendTransactionResponse?.hash;
    if (!hash) {
      throw new Error("settle transaction submitted without a hash");
    }
    return { settleTx: hash };
  }
}
