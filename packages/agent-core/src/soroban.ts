import {
  escrowGetBalance as onchainEscrowGetBalance,
  escrowGetVerifier as onchainEscrowGetVerifier,
  registryGetChannel as onchainRegistryGetChannel,
  registryHasChannel as onchainRegistryHasChannel,
  sorobanConfigFromEnv,
  verifierVerify as onchainVerifierVerify,
  type ChannelEntry,
  type SorobanConfig,
  type VerifierProof,
  type VerifierPublicSignals,
} from "@drongo/onchain-setup";

export type { ChannelEntry, SorobanConfig, VerifierProof, VerifierPublicSignals };

function resolveConfig(config?: SorobanConfig): SorobanConfig {
  return config ?? sorobanConfigFromEnv();
}

/** Simulate `meteredverifier.verify` on-chain. */
export async function verifierVerify(
  proof: VerifierProof,
  publicSignals: VerifierPublicSignals,
  config?: SorobanConfig,
): Promise<boolean> {
  return onchainVerifierVerify(resolveConfig(config), proof, publicSignals);
}

/** @deprecated Use {@link verifierVerify}. */
export const VerifierVerify = verifierVerify;

/** Read the verifier contract address stored on `slate-escrow`. */
export async function escrowGetVerifier(config?: SorobanConfig): Promise<string> {
  return onchainEscrowGetVerifier(resolveConfig(config));
}

/** Read a depositor's internal escrow balance for a token (micro-units). */
export async function escrowGetBalance(
  address: string,
  tokenAddress: string,
  config?: SorobanConfig,
): Promise<bigint> {
  return onchainEscrowGetBalance(resolveConfig(config), address, tokenAddress);
}

/** Return the registered channel record and lifecycle status. */
export async function registryGetChannel(
  channelId: bigint,
  config?: SorobanConfig,
): Promise<ChannelEntry> {
  return onchainRegistryGetChannel(resolveConfig(config), channelId);
}

/** Whether a channel record exists for `channelId`. */
export async function registryHasChannel(
  channelId: bigint,
  config?: SorobanConfig,
): Promise<boolean> {
  return onchainRegistryHasChannel(resolveConfig(config), channelId);
}

export { sorobanConfigFromEnv, SOROBAN_TESTNET } from "@drongo/onchain-setup";
