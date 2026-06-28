import type { AddressPayload, ConsumerPublicKey, SerializedSettlement } from "@drongo/proving-setup";

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

function shortHex(value: bigint): string {
  return value.toString(16).slice(0, 10);
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
 * NOT yet wired: `onchain-setup` exposes no TypeScript bindings today, so this
 * needs (1) generated contract bindings or `@stellar/stellar-sdk`, (2) the
 * deployed `slate-escrow` / `slate-agent-registry` contract IDs, (3) the USDC
 * SEP-41 token, and (4) a funded Stellar signer. Until then it throws so callers
 * fail loudly rather than silently no-op.
 */
export class SorobanChainClient implements ChainClient {
  async openChannel(_args: OpenChannelArgs): Promise<{ channelId: string; openTx: string }> {
    throw new Error(
      "SorobanChainClient not configured: register_channel + add_to_depositors need @drongo/onchain-setup TS bindings, deployed contract IDs, the USDC SEP-41 token, and a Stellar signer.",
    );
  }

  async settle(_args: SettleArgs): Promise<{ settleTx: string }> {
    throw new Error(
      "SorobanChainClient not configured: slate-escrow.settle needs the deployed escrow contract ID and a Stellar signer; wire @drongo/onchain-setup first.",
    );
  }
}
