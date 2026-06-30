import { assertSorobanConfig, type SorobanConfig } from "./config.js";
import { readOnlyClientOptions, toMeteredVerifierProof, unwrapSimulationResult } from "./internal.js";
import { Client as MeteredVerifierClient } from "./bindings/meteredverifier/src/index.js";
import { Client as SlateEscrowClient } from "./bindings/slate-escrow/src/index.js";
import {
  Client as SlateAgentRegistryClient,
  type ChannelEntry,
} from "./bindings/slate-agent-registry/src/index.js";

export type { ChannelEntry } from "./bindings/slate-agent-registry/src/index.js";

export interface VerifierProof {
  a: Uint8Array;
  b: Uint8Array;
  c: Uint8Array;
}

export type VerifierPublicSignals = bigint[];

const PUBLIC_SIGNAL_COUNT = 13;

/**
 * Simulate `meteredverifier.verify` against a deployed contract.
 * Returns `true` when the Groth16 proof is valid for the embedded verifying key.
 */
export async function verifierVerify(
  config: SorobanConfig,
  proof: VerifierProof,
  publicSignals: VerifierPublicSignals,
): Promise<boolean> {
  assertSorobanConfig(config);
  if (publicSignals.length !== PUBLIC_SIGNAL_COUNT) {
    throw new Error(
      `expected ${PUBLIC_SIGNAL_COUNT} public signals, received ${publicSignals.length}`,
    );
  }

  const client = new MeteredVerifierClient(
    readOnlyClientOptions(config, config.meteredVerifierId),
  );
  const tx = await client.verify({
    proof: toMeteredVerifierProof(proof),
    public_signals: publicSignals,
  });
  return unwrapSimulationResult(tx.result);
}

/** Read the verifier contract address configured on `slate-escrow`. */
export async function escrowGetVerifier(config: SorobanConfig): Promise<string> {
  assertSorobanConfig(config);
  const client = new SlateEscrowClient(readOnlyClientOptions(config, config.slateEscrowId));
  const tx = await client.get_verifier();
  return unwrapSimulationResult(tx.result);
}

/** Read the agent registry contract address configured on `slate-escrow`. */
export async function escrowGetRegistry(config: SorobanConfig): Promise<string> {
  assertSorobanConfig(config);
  const client = new SlateEscrowClient(readOnlyClientOptions(config, config.slateEscrowId));
  const tx = await client.get_registry();
  return unwrapSimulationResult(tx.result);
}

/** Read a depositor's internal escrow balance for a token (micro-units). */
export async function escrowGetBalance(
  config: SorobanConfig,
  address: string,
  tokenAddress: string,
): Promise<bigint> {
  assertSorobanConfig(config);
  const client = new SlateEscrowClient(readOnlyClientOptions(config, config.slateEscrowId));
  const tx = await client.get_balance({ address, token_address: tokenAddress });
  return BigInt(unwrapSimulationResult(tx.result));
}

/** Return the registered channel record and lifecycle status. */
export async function registryGetChannel(
  config: SorobanConfig,
  channelId: bigint,
): Promise<ChannelEntry> {
  assertSorobanConfig(config);
  const client = new SlateAgentRegistryClient(
    readOnlyClientOptions(config, config.slateAgentRegistryId),
  );
  const tx = await client.get_channel({ channel_id: channelId });
  return unwrapSimulationResult(tx.result);
}

/** Whether a channel record exists for `channelId`. */
export async function registryHasChannel(
  config: SorobanConfig,
  channelId: bigint,
): Promise<boolean> {
  assertSorobanConfig(config);
  const client = new SlateAgentRegistryClient(
    readOnlyClientOptions(config, config.slateAgentRegistryId),
  );
  const tx = await client.has_channel({ channel_id: channelId });
  return unwrapSimulationResult(tx.result);
}
