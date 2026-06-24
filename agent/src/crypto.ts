import { buildEddsa, buildPoseidon } from "circomlibjs";
import type { BabyJubPublicKey, EdDSASignature } from "./types.js";

/**
 * DrongoCrypto wraps circomlibjs (Poseidon + EdDSA-BabyJubjub) behind a clean
 * bigint-only API. Using circomlibjs — rather than a generic Ed25519 library — is
 * deliberate: it produces signatures and hashes that the Circom circuit's
 * `EdDSAPoseidonVerifier` / `Poseidon` templates verify natively. Same constants,
 * same field, no cross-implementation drift.
 *
 * All field elements are kept internal; callers only ever see bigint / strings.
 */
export class DrongoCrypto {
  private constructor(
    private readonly eddsa: any,
    private readonly poseidonFn: any,
  ) {}

  /** Build the WASM-backed primitives. Call once and reuse (it is not cheap). */
  static async build(): Promise<DrongoCrypto> {
    const [eddsa, poseidonFn] = await Promise.all([buildEddsa(), buildPoseidon()]);
    return new DrongoCrypto(eddsa, poseidonFn);
  }

  /** Poseidon hash of field-element inputs, returned as a canonical bigint. */
  poseidon(inputs: bigint[]): bigint {
    const h = this.poseidonFn(inputs);
    return this.poseidonFn.F.toObject(h);
  }

  /** Derive the BabyJubjub public key (Ax, Ay) for a 32-byte private key. */
  publicKey(privateKey: Buffer): BabyJubPublicKey {
    const [Ax, Ay] = this.eddsa.prv2pub(privateKey);
    return { Ax: this.eddsa.F.toObject(Ax), Ay: this.eddsa.F.toObject(Ay) };
  }

  /** Sign a single field-element message with EdDSA-BabyJubjub (Poseidon variant). */
  sign(privateKey: Buffer, msg: bigint): EdDSASignature {
    const sig = this.eddsa.signPoseidon(privateKey, this.eddsa.F.e(msg));
    return {
      R8x: this.eddsa.F.toObject(sig.R8[0]),
      R8y: this.eddsa.F.toObject(sig.R8[1]),
      S: BigInt(sig.S),
    };
  }

  /** Verify an EdDSA-BabyJubjub (Poseidon) signature over a field-element message. */
  verify(msg: bigint, sig: EdDSASignature, pub: BabyJubPublicKey): boolean {
    const signature = {
      R8: [this.eddsa.F.e(sig.R8x), this.eddsa.F.e(sig.R8y)],
      S: sig.S,
    };
    const A = [this.eddsa.F.e(pub.Ax), this.eddsa.F.e(pub.Ay)];
    return this.eddsa.verifyPoseidon(this.eddsa.F.e(msg), signature, A);
  }
}
