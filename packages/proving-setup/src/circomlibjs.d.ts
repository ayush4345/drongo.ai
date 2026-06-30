// Minimal ambient typings for the parts of `circomlibjs` used by this package.
// `circomlibjs` ships no type declarations, and the strict
// `verbatimModuleSyntax` / NodeNext config rejects an untyped import.
declare module "circomlibjs" {
  /** A finite-field helper as exposed by circomlibjs builders. */
  export interface FiniteField {
    /** Coerce a value into a field element. */
    e(value: number | bigint | string | Uint8Array): unknown;
    /** Convert a field element back into a `bigint`. */
    toObject(element: unknown): bigint;
  }

  /** Poseidon hasher: callable with an array of field-coercible inputs. */
  export interface Poseidon {
    (inputs: ReadonlyArray<number | bigint | string | Uint8Array>): unknown;
    F: FiniteField;
  }

  export function buildPoseidon(): Promise<Poseidon>;

  export interface EddsaSignature {
    R8: [unknown, unknown];
    S: bigint;
  }

  export interface Eddsa {
    F: FiniteField;
    /** Derive the Baby Jubjub public key `[Ax, Ay]` from a private key. */
    prv2pub(privateKey: Uint8Array): [unknown, unknown];
    /** Sign a field-element message with EdDSA-Poseidon. */
    signPoseidon(privateKey: Uint8Array, message: unknown): EddsaSignature;
    /** Verify an EdDSA-Poseidon signature. */
    verifyPoseidon(message: unknown, signature: EddsaSignature, publicKey: [unknown, unknown]): boolean;
  }

  export function buildEddsa(): Promise<Eddsa>;
}
