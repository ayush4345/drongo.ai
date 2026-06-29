import { Buffer } from "buffer";
import { Keypair } from "@stellar/stellar-sdk";
import type { ClientOptions, Result } from "@stellar/stellar-sdk/contract";
import type { SorobanConfig } from "./config.js";
import type { Proof as MeteredVerifierProof } from "./bindings/meteredverifier/src/index.js";

export class SorobanSimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SorobanSimulationError";
  }
}

/** Any account works as the simulation source for read-only contract calls. */
export function readOnlyClientOptions(
  config: SorobanConfig,
  contractId: string,
): ClientOptions {
  return {
    contractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    publicKey: Keypair.random().publicKey(),
  };
}

export function toMeteredVerifierProof(proof: {
  a: Uint8Array;
  b: Uint8Array;
  c: Uint8Array;
}): MeteredVerifierProof {
  return {
    a: Buffer.from(proof.a),
    b: Buffer.from(proof.b),
    c: Buffer.from(proof.c),
  };
}

export function unwrapSimulationResult<T>(result: T | Result<T> | undefined): T {
  if (result === undefined) {
    throw new SorobanSimulationError("Contract simulation returned no result");
  }
  if (typeof result === "object" && result !== null && "unwrap" in result) {
    return (result as Result<T>).unwrap();
  }
  return result as T;
}
