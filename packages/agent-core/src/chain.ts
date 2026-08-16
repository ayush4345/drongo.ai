import type { AddressPayload, ConsumerPublicKey, SerializedSettlement } from "@drongo/proving-setup";

/**
 * The on-chain seam. Opening a channel = `SlateAgentRegistry.registerChannel`
 * + `SlateEscrow.addToDepositors`; closing = `SlateEscrow.settle`. Agents
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

function shortHex(value: bigint): string {
  return value.toString(16).slice(0, 10);
}

/**
 * In-memory chain for local demos and tests. It does not touch Base — it just
 * records the calls so the request -> meter -> prove -> settle loop runs
 * end-to-end offline. Swap in {@link BaseChainClient} for real settlement.
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
