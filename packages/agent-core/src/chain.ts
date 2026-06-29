import { Buffer } from "buffer";
import type { AddressPayload, ConsumerPublicKey, SerializedSettlement } from "@drongo/proving-setup";
import {
  assertSorobanConfig,
  SlateAgentRegistryClient,
  SlateEscrowClient,
  type SorobanConfig,
} from "@drongo/onchain-setup";
import { Address, Keypair, rpc, SorobanDataBuilder, TransactionBuilder } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import type {
  AssembledTransaction,
  ClientOptions,
  MethodOptions,
  SentTransaction,
} from "@stellar/stellar-sdk/contract";

/** Groth16 settle + token transfers need a large Soroban resource budget on testnet. */
const SETTLE_METHOD_OPTIONS: MethodOptions = {
  fee: "5000000",
  restore: true,
  // Dropped txs stay NOT_FOUND; fail fast and retry rather than blocking 5+ minutes.
  timeoutInSeconds: 120,
};

/** Multiply simulated resource fee — pairing verify can exceed the RPC minimum. */
const SETTLE_RESOURCE_FEE_MULTIPLIER = 2n;

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

function createRpcServer(config: SorobanConfig): rpc.Server {
  return new rpc.Server(config.rpcUrl.replace(/\/$/, ""));
}

function signedClientOptions(
  config: SorobanConfig,
  contractId: string,
  keypair: Keypair,
  server?: rpc.Server,
): ClientOptions {
  return {
    contractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    publicKey: keypair.publicKey(),
    ...(server ? { server } : {}),
    ...basicNodeSigner(keypair, config.networkPassphrase),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function assertTransactionSucceeded<T>(label: string, sent: SentTransaction<T>): void {
  const status = sent.getTransactionResponse?.status;
  if (status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`${label} transaction did not succeed (status: ${status ?? "unknown"})`);
  }
}

function isTxBadSeqError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // SendFailedError often embeds txBadSeq in serialized errorResult, not in .message.
  const blob = `${err.message}\n${err.stack ?? ""}\n${JSON.stringify(err, null, 2)}`;
  return blob.includes("txBadSeq");
}

function isTransactionStillPendingError(err: unknown): boolean {
  return err instanceof Error && err.constructor.name === "TransactionStillPendingError";
}

function isRetriableSendError(err: unknown): boolean {
  return isTxBadSeqError(err) || isTransactionStillPendingError(err);
}

function bumpSorobanResourceFee<T>(tx: AssembledTransaction<T>, multiplier: bigint): void {
  if (!tx.built) {
    throw new Error("transaction not built after simulation");
  }
  const data = tx.simulationData.transactionData;
  const bumped = new SorobanDataBuilder(data.toXDR())
    .setResourceFee(data.resourceFee().toBigInt() * multiplier)
    .build();
  tx.built = TransactionBuilder.cloneFrom(tx.built, { sorobanData: bumped }).build();
}

/** Expected envelope sequence for the account's current on-ledger sequence. */
function expectedTxSequence(accountSequence: string): string {
  return (BigInt(accountSequence) + 1n).toString();
}

function assertFreshTxSequence<T>(
  tx: AssembledTransaction<T>,
  accountSequence: string,
  label: string,
): void {
  const builtSeq = tx.built?.sequence;
  const expected = expectedTxSequence(accountSequence);
  if (builtSeq !== undefined && builtSeq !== expected) {
    throw new Error(
      `${label} assembled with stale sequence ${builtSeq}; network expects ${expected}`,
    );
  }
}

/**
 * Assemble, sign, and send with retries when the Soroban RPC returns `txBadSeq`.
 * Each attempt builds a fresh contract client so sequence numbers are not cached.
 */
async function signAndSendWithRetry<T>(
  assemble: (server: rpc.Server) => Promise<AssembledTransaction<T>>,
  server: rpc.Server,
  publicKey: string,
  label: string,
  maxAttempts = 8,
  afterAssemble?: (tx: AssembledTransaction<T>) => void,
): Promise<SentTransaction<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt === 0) {
      console.log(`  chain: ${label}…`);
    } else {
      console.log(`  chain: ${label} retry ${attempt + 1}/${maxAttempts}…`);
    }

    const accountSequence = (await server.getAccount(publicKey)).sequenceNumber();
    const tx = await assemble(server);
    afterAssemble?.(tx);
    const builtSeq = tx.built?.sequence;
    const expected = expectedTxSequence(accountSequence);

    if (builtSeq !== undefined && builtSeq !== expected) {
      if (attempt < maxAttempts - 1) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      assertFreshTxSequence(tx, accountSequence, label);
    }

    try {
      const sent = await tx.signAndSend();
      assertTransactionSucceeded(label, sent);
      return sent;
    } catch (err) {
      lastError = err;
      if (!isRetriableSendError(err) || attempt === maxAttempts - 1) throw err;
      const delayMs = isTransactionStillPendingError(err) ? 2000 : 800 * (attempt + 1);
      console.log(
        `  chain: ${label} send failed (${err instanceof Error ? err.constructor.name : "unknown"}), retrying…`,
      );
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} signAndSend failed after ${maxAttempts} attempts`);
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

    const server = createRpcServer(this.config);
    const depositorPublic = this.depositorKeypair.publicKey();

    const registerSent = await signAndSendWithRetry(
      (rpcServer) =>
        new SlateAgentRegistryClient(
          signedClientOptions(
            this.config,
            this.config.slateAgentRegistryId,
            this.depositorKeypair,
            rpcServer,
          ),
        ).register_channel({
          channel_id: args.channelId,
          rate_commitment: args.rateCommitment,
          consumer_pubkey_x: args.consumerPublicKey.x,
          consumer_pubkey_y: args.consumerPublicKey.y,
          depositor,
          provider,
          token,
        }),
      server,
      depositorPublic,
      "register_channel",
    );

    const depositSent = await signAndSendWithRetry(
      (rpcServer) =>
        new SlateEscrowClient(
          signedClientOptions(this.config, this.config.slateEscrowId, this.depositorKeypair, rpcServer),
        ).add_to_depositors({
          address: depositor,
          amount: args.escrow,
          token_address: token,
        }),
      server,
      depositorPublic,
      "add_to_depositors",
    );

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

    const server = createRpcServer(this.config);
    const settlePublic = this.settleKeypair.publicKey();
    const sent = await signAndSendWithRetry(
      (rpcServer) =>
        new SlateEscrowClient(
          signedClientOptions(this.config, this.config.slateEscrowId, this.settleKeypair, rpcServer),
        ).settle(
          {
            proof: toEscrowProof(args.settlement),
            public_signals: args.settlement.publicSignals,
            depositor,
            provider,
            token,
          },
          SETTLE_METHOD_OPTIONS,
        ),
      server,
      settlePublic,
      "settle",
      8,
      (tx) => {
        bumpSorobanResourceFee(tx, SETTLE_RESOURCE_FEE_MULTIPLIER);
        if (tx.built?.fee) {
          console.log(`  chain: settle max fee ${tx.built.fee} stroops`);
        }
      },
    );
    const hash = sent.sendTransactionResponse?.hash;
    if (!hash) {
      throw new Error("settle transaction submitted without a hash");
    }
    return { settleTx: hash };
  }
}
