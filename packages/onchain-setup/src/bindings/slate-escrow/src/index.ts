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
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"InvalidAmount"},
  4: {message:"TokenNotWhitelisted"},
  5: {message:"WrongPublicInputLength"},
  6: {message:"MissingChannelId"},
  7: {message:"DepositorMismatch"},
  8: {message:"ProviderMismatch"},
  9: {message:"TokenMismatch"},
  10: {message:"InvalidProof"},
  11: {message:"MissingEscrowAmount"},
  12: {message:"MissingSettlementAmount"},
  13: {message:"MissingNullifier"},
  14: {message:"EscrowAmountOverflow"},
  15: {message:"SettlementAmountOverflow"},
  16: {message:"SettlementExceedsEscrow"},
  17: {message:"NullifierSpent"},
  18: {message:"InsufficientBalance"},
  19: {message:"NoBalanceToRefund"},
  20: {message:"UnsupportedAddress"},
  21: {message:"MissingPublicSignal"}
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
  init: ({verifier, registry}: {verifier: string, registry: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a refund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  refund: ({depositor, token_address}: {depositor: string, token_address: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a settle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  settle: ({proof, public_signals, depositor, provider, token}: {proof: Proof, public_signals: Array<u256>, depositor: string, provider: string, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_balance: ({address, token_address}: {address: string, token_address: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_registry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_registry: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a get_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_verifier: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a whitelist_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  whitelist_token: ({token_address}: {token_address: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a add_to_depositors transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  add_to_depositors: ({address, amount, token_address}: {address: string, amount: i128, token_address: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAFQAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAMAAAAAAAAAE1Rva2VuTm90V2hpdGVsaXN0ZWQAAAAABAAAAAAAAAAWV3JvbmdQdWJsaWNJbnB1dExlbmd0aAAAAAAABQAAAAAAAAAQTWlzc2luZ0NoYW5uZWxJZAAAAAYAAAAAAAAAEURlcG9zaXRvck1pc21hdGNoAAAAAAAABwAAAAAAAAAQUHJvdmlkZXJNaXNtYXRjaAAAAAgAAAAAAAAADVRva2VuTWlzbWF0Y2gAAAAAAAAJAAAAAAAAAAxJbnZhbGlkUHJvb2YAAAAKAAAAAAAAABNNaXNzaW5nRXNjcm93QW1vdW50AAAAAAsAAAAAAAAAF01pc3NpbmdTZXR0bGVtZW50QW1vdW50AAAAAAwAAAAAAAAAEE1pc3NpbmdOdWxsaWZpZXIAAAANAAAAAAAAABRFc2Nyb3dBbW91bnRPdmVyZmxvdwAAAA4AAAAAAAAAGFNldHRsZW1lbnRBbW91bnRPdmVyZmxvdwAAAA8AAAAAAAAAF1NldHRsZW1lbnRFeGNlZWRzRXNjcm93AAAAABAAAAAAAAAADk51bGxpZmllclNwZW50AAAAAAARAAAAAAAAABNJbnN1ZmZpY2llbnRCYWxhbmNlAAAAABIAAAAAAAAAEU5vQmFsYW5jZVRvUmVmdW5kAAAAAAAAEwAAAAAAAAASVW5zdXBwb3J0ZWRBZGRyZXNzAAAAAAAUAAAAAAAAABNNaXNzaW5nUHVibGljU2lnbmFsAAAAABU=",
        "AAAAAQAAAAAAAAAAAAAABVByb29mAAAAAAAAAwAAAAAAAAABYQAAAAAAA+4AAABAAAAAAAAAAAFiAAAAAAAD7gAAAIAAAAAAAAAAAWMAAAAAAAPuAAAAQA==",
        "AAAAAAAAAAAAAAAEaW5pdAAAAAIAAAAAAAAACHZlcmlmaWVyAAAAEwAAAAAAAAAIcmVnaXN0cnkAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAGcmVmdW5kAAAAAAACAAAAAAAAAAlkZXBvc2l0b3IAAAAAAAATAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAGc2V0dGxlAAAAAAAFAAAAAAAAAAVwcm9vZgAAAAAAB9AAAAAFUHJvb2YAAAAAAAAAAAAADnB1YmxpY19zaWduYWxzAAAAAAPqAAAADAAAAAAAAAAJZGVwb3NpdG9yAAAAAAAAEwAAAAAAAAAIcHJvdmlkZXIAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAQAAAAAAAAAAAAAADERlcG9zaXRvcktleQAAAAIAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAEdXNlcgAAABM=",
        "AAAAAAAAAAAAAAALZ2V0X2JhbGFuY2UAAAAAAgAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAA10b2tlbl9hZGRyZXNzAAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAMZ2V0X3JlZ2lzdHJ5AAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAAAAAAAMZ2V0X3ZlcmlmaWVyAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAAAAAAAPd2hpdGVsaXN0X3Rva2VuAAAAAAEAAAAAAAAADXRva2VuX2FkZHJlc3MAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAARYWRkX3RvX2RlcG9zaXRvcnMAAAAAAAADAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAANdG9rZW5fYWRkcmVzcwAAAAAAABMAAAABAAAD6QAAAAIAAAAD" ]),
      options
    )
  }
  public readonly fromJSON = {
    init: this.txFromJSON<Result<void>>,
        refund: this.txFromJSON<Result<void>>,
        settle: this.txFromJSON<Result<void>>,
        get_balance: this.txFromJSON<i128>,
        get_registry: this.txFromJSON<Result<string>>,
        get_verifier: this.txFromJSON<Result<string>>,
        whitelist_token: this.txFromJSON<Result<void>>,
        add_to_depositors: this.txFromJSON<Result<void>>
  }
}