import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof globalThis !== "undefined" && "window" in globalThis) {
  //@ts-ignore Buffer exists
  (globalThis as { window?: { Buffer?: typeof Buffer } }).window!.Buffer =
    (globalThis as { window?: { Buffer?: typeof Buffer } }).window!.Buffer || Buffer;
}




export const Errors = {
  /**
   * The number of supplied public signals does not match the verifying key.
   */
  1: {message:"WrongPublicInputLength"}
}


/**
 * A Groth16 proof on the BN254 curve, in the uncompressed Ethereum-compatible
 * serialization that the Soroban BN254 host functions expect.
 * 
 * - `a` and `c` are G1 points: 64 bytes = be(X) || be(Y)
 * - `b` is a G2 point: 128 bytes = be(X) || be(Y), each Fp2 = be(c1) || be(c0)
 */
export interface Proof {
  a: Buffer;
  b: Buffer;
  c: Buffer;
}

export interface Client {
  /**
   * Construct and simulate a verify transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verify a Groth16 proof for the metered-settlement circuit.
   * 
   * `public_signals` are the circuit's public inputs (BN254 scalar field
   * elements) in the same order snarkjs emits them in `public.json`:
   * `[channel_id, rate_commitment, escrow_amount, settlement_amount,
   * nullifier, consumer_pubkey_x, consumer_pubkey_y,
   * depositor_hi, depositor_lo, provider_hi, provider_lo, token_hi, token_lo]`.
   * 
   * Returns `true` iff the proof is valid for the embedded verifying key.
   */
  verify: ({proof, public_signals}: {proof: Proof, public_signals: Array<u256>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAAQAAAEdUaGUgbnVtYmVyIG9mIHN1cHBsaWVkIHB1YmxpYyBzaWduYWxzIGRvZXMgbm90IG1hdGNoIHRoZSB2ZXJpZnlpbmcga2V5LgAAAAAWV3JvbmdQdWJsaWNJbnB1dExlbmd0aAAAAAAAAQ==",
        "AAAAAQAAAQxBIEdyb3RoMTYgcHJvb2Ygb24gdGhlIEJOMjU0IGN1cnZlLCBpbiB0aGUgdW5jb21wcmVzc2VkIEV0aGVyZXVtLWNvbXBhdGlibGUKc2VyaWFsaXphdGlvbiB0aGF0IHRoZSBTb3JvYmFuIEJOMjU0IGhvc3QgZnVuY3Rpb25zIGV4cGVjdC4KCi0gYGFgIGFuZCBgY2AgYXJlIEcxIHBvaW50czogNjQgYnl0ZXMgPSBiZShYKSB8fCBiZShZKQotIGBiYCBpcyBhIEcyIHBvaW50OiAxMjggYnl0ZXMgPSBiZShYKSB8fCBiZShZKSwgZWFjaCBGcDIgPSBiZShjMSkgfHwgYmUoYzApAAAAAAAAAAVQcm9vZgAAAAAAAAMAAAAAAAAAAWEAAAAAAAPuAAAAQAAAAAAAAAABYgAAAAAAA+4AAACAAAAAAAAAAAFjAAAAAAAD7gAAAEA=",
        "AAAAAAAAAcZWZXJpZnkgYSBHcm90aDE2IHByb29mIGZvciB0aGUgbWV0ZXJlZC1zZXR0bGVtZW50IGNpcmN1aXQuCgpgcHVibGljX3NpZ25hbHNgIGFyZSB0aGUgY2lyY3VpdCdzIHB1YmxpYyBpbnB1dHMgKEJOMjU0IHNjYWxhciBmaWVsZAplbGVtZW50cykgaW4gdGhlIHNhbWUgb3JkZXIgc25hcmtqcyBlbWl0cyB0aGVtIGluIGBwdWJsaWMuanNvbmA6CmBbY2hhbm5lbF9pZCwgcmF0ZV9jb21taXRtZW50LCBlc2Nyb3dfYW1vdW50LCBzZXR0bGVtZW50X2Ftb3VudCwKbnVsbGlmaWVyLCBjb25zdW1lcl9wdWJrZXlfeCwgY29uc3VtZXJfcHVia2V5X3ksCmRlcG9zaXRvcl9oaSwgZGVwb3NpdG9yX2xvLCBwcm92aWRlcl9oaSwgcHJvdmlkZXJfbG8sIHRva2VuX2hpLCB0b2tlbl9sb11gLgoKUmV0dXJucyBgdHJ1ZWAgaWZmIHRoZSBwcm9vZiBpcyB2YWxpZCBmb3IgdGhlIGVtYmVkZGVkIHZlcmlmeWluZyBrZXkuAAAAAAAGdmVyaWZ5AAAAAAACAAAAAAAAAAVwcm9vZgAAAAAAB9AAAAAFUHJvb2YAAAAAAAAAAAAADnB1YmxpY19zaWduYWxzAAAAAAPqAAAADAAAAAEAAAPpAAAAAQAAAAM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    verify: this.txFromJSON<Result<boolean>>
  }
}