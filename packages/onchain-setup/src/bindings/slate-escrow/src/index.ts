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





export interface Proof {
  a: Buffer;
  b: Buffer;
  c: Buffer;
}


export interface DepositorKey {
  token: string;
  user: string;
}

export interface Client {
  /**
   * Construct and simulate a init transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  init: ({verifier}: {verifier: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a refund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  refund: ({depositor, token_address}: {depositor: string, token_address: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a settle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  settle: ({proof, public_signals, depositor, provider, token}: {proof: Proof, public_signals: Array<u256>, depositor: string, provider: string, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_balance: ({address, token_address}: {address: string, token_address: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_verifier: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a whitelist_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  whitelist_token: ({token_address}: {token_address: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a add_to_depositors transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  add_to_depositors: ({address, amount, token_address}: {address: string, amount: i128, token_address: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAABVByb29mAAAAAAAAAwAAAAAAAAABYQAAAAAAA+4AAABAAAAAAAAAAAFiAAAAAAAD7gAAAIAAAAAAAAAAAWMAAAAAAAPuAAAAQA==",
        "AAAAAAAAAAAAAAAEaW5pdAAAAAEAAAAAAAAACHZlcmlmaWVyAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAGcmVmdW5kAAAAAAACAAAAAAAAAAlkZXBvc2l0b3IAAAAAAAATAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAGc2V0dGxlAAAAAAAFAAAAAAAAAAVwcm9vZgAAAAAAB9AAAAAFUHJvb2YAAAAAAAAAAAAADnB1YmxpY19zaWduYWxzAAAAAAPqAAAADAAAAAAAAAAJZGVwb3NpdG9yAAAAAAAAEwAAAAAAAAAIcHJvdmlkZXIAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAA",
        "AAAAAQAAAAAAAAAAAAAADERlcG9zaXRvcktleQAAAAIAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAEdXNlcgAAABM=",
        "AAAAAAAAAAAAAAALZ2V0X2JhbGFuY2UAAAAAAgAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAMZ2V0X3ZlcmlmaWVyAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAPd2hpdGVsaXN0X3Rva2VuAAAAAAEAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAARYWRkX3RvX2RlcG9zaXRvcnMAAAAAAAADAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAAA" ]),
      options
    )
  }
  public readonly fromJSON = {
    init: this.txFromJSON<null>,
        refund: this.txFromJSON<null>,
        settle: this.txFromJSON<null>,
        get_balance: this.txFromJSON<i128>,
        get_verifier: this.txFromJSON<string>,
        whitelist_token: this.txFromJSON<null>,
        add_to_depositors: this.txFromJSON<null>
  }
}