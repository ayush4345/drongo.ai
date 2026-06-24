import { randomBytes } from "node:crypto";
import type { DrongoCrypto } from "./crypto.js";
import type { BabyJubPublicKey } from "./types.js";

/** A consumer's signing identity: a BabyJubjub private key and its derived public key. */
export interface ConsumerIdentity {
  privateKey: Buffer;
  publicKey: BabyJubPublicKey;
}

/**
 * Create a consumer identity. Pass a fixed 32-byte `seed` for deterministic tests;
 * omit it for a fresh random key.
 */
export function createIdentity(crypto: DrongoCrypto, seed?: Buffer): ConsumerIdentity {
  const privateKey = seed ?? randomBytes(32);
  return { privateKey, publicKey: crypto.publicKey(privateKey) };
}

/**
 * A uniformly random value safely inside the BN254 scalar field (< 2^248 < r).
 * Used for channel ids, rate blinds, and channel secrets.
 */
export function randomFieldValue(): bigint {
  return BigInt("0x" + randomBytes(31).toString("hex"));
}
