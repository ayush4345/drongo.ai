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
  1: {message:"ChannelAlreadyRegistered"},
  2: {message:"ChannelNotFound"},
  3: {message:"WrongPublicInputLength"},
  4: {message:"ChannelIdMismatch"},
  5: {message:"ChannelNotOpen"},
  6: {message:"RateCommitmentMismatch"},
  7: {message:"ConsumerPubkeyMismatch"},
  8: {message:"DepositorMismatch"},
  9: {message:"ProviderMismatch"},
  10: {message:"TokenMismatch"},
  11: {message:"ChannelAlreadyClosed"},
  12: {message:"UnauthorizedCloser"},
  13: {message:"UnsupportedAddress"},
  14: {message:"MissingPublicSignal"}
}


export interface ChannelEntry {
  record: ChannelRecord;
  status: ChannelStatus;
}


/**
 * Fixed settlement arguments for a payment channel, keyed by `channel_id`.
 * 
 * These fields correspond to the non-varying public inputs in
 * `setttlement.circom` (indices 1, 5–12). Per-settlement values
 * (`escrow_amount`, `settlement_amount`, `nullifier`) are supplied in the
 * proof and are not stored here.
 */
export interface ChannelRecord {
  consumer_pubkey_x: u256;
  consumer_pubkey_y: u256;
  depositor: string;
  provider: string;
  rate_commitment: u256;
  token: string;
}

export type ChannelStatus = {tag: "Open", values: void} | {tag: "Closed", values: void};

export interface Client {
  /**
   * Construct and simulate a get_channel transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the channel record and lifecycle status for `channel_id`.
   */
  get_channel: ({channel_id}: {channel_id: u256}, options?: MethodOptions) => Promise<AssembledTransaction<Result<ChannelEntry>>>

  /**
   * Construct and simulate a has_channel transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether a channel record exists for `channel_id`.
   */
  has_channel: ({channel_id}: {channel_id: u256}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a close_channel transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Mark a channel closed. Only the registered depositor or provider may call.
   */
  close_channel: ({channel_id, caller}: {channel_id: u256, caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a register_channel transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register a new payment channel. The depositor must authorize the call.
   * 
   * `channel_id` is the opaque identifier used in the ZK circuit and must be
   * unique. The stored fields are the fixed public inputs that every
   * settlement proof for this channel must include.
   */
  register_channel: ({channel_id, rate_commitment, consumer_pubkey_x, consumer_pubkey_y, depositor, provider, token}: {channel_id: u256, rate_commitment: u256, consumer_pubkey_x: u256, consumer_pubkey_y: u256, depositor: string, provider: string, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a validate_for_settlement transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Assert that `public_signals` are consistent with the registered channel.
   * 
   * Intended for cross-contract use by `slate-escrow` before settlement:
   * checks channel is open, `public_signals[0]` matches `channel_id`, and
   * indices 1 and 5–12 match the stored record.
   */
  validate_for_settlement: ({channel_id, public_signals}: {channel_id: u256, public_signals: Array<u256>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADgAAAAAAAAAYQ2hhbm5lbEFscmVhZHlSZWdpc3RlcmVkAAAAAQAAAAAAAAAPQ2hhbm5lbE5vdEZvdW5kAAAAAAIAAAAAAAAAFldyb25nUHVibGljSW5wdXRMZW5ndGgAAAAAAAMAAAAAAAAAEUNoYW5uZWxJZE1pc21hdGNoAAAAAAAABAAAAAAAAAAOQ2hhbm5lbE5vdE9wZW4AAAAAAAUAAAAAAAAAFlJhdGVDb21taXRtZW50TWlzbWF0Y2gAAAAAAAYAAAAAAAAAFkNvbnN1bWVyUHVia2V5TWlzbWF0Y2gAAAAAAAcAAAAAAAAAEURlcG9zaXRvck1pc21hdGNoAAAAAAAACAAAAAAAAAAQUHJvdmlkZXJNaXNtYXRjaAAAAAkAAAAAAAAADVRva2VuTWlzbWF0Y2gAAAAAAAAKAAAAAAAAABRDaGFubmVsQWxyZWFkeUNsb3NlZAAAAAsAAAAAAAAAElVuYXV0aG9yaXplZENsb3NlcgAAAAAADAAAAAAAAAASVW5zdXBwb3J0ZWRBZGRyZXNzAAAAAAANAAAAAAAAABNNaXNzaW5nUHVibGljU2lnbmFsAAAAAA4=",
        "AAAAAQAAAAAAAAAAAAAADENoYW5uZWxFbnRyeQAAAAIAAAAAAAAABnJlY29yZAAAAAAH0AAAAA1DaGFubmVsUmVjb3JkAAAAAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAANQ2hhbm5lbFN0YXR1cwAAAA==",
        "AAAAAQAAASxGaXhlZCBzZXR0bGVtZW50IGFyZ3VtZW50cyBmb3IgYSBwYXltZW50IGNoYW5uZWwsIGtleWVkIGJ5IGBjaGFubmVsX2lkYC4KClRoZXNlIGZpZWxkcyBjb3JyZXNwb25kIHRvIHRoZSBub24tdmFyeWluZyBwdWJsaWMgaW5wdXRzIGluCmBzZXR0dGxlbWVudC5jaXJjb21gIChpbmRpY2VzIDEsIDXigJMxMikuIFBlci1zZXR0bGVtZW50IHZhbHVlcwooYGVzY3Jvd19hbW91bnRgLCBgc2V0dGxlbWVudF9hbW91bnRgLCBgbnVsbGlmaWVyYCkgYXJlIHN1cHBsaWVkIGluIHRoZQpwcm9vZiBhbmQgYXJlIG5vdCBzdG9yZWQgaGVyZS4AAAAAAAAADUNoYW5uZWxSZWNvcmQAAAAAAAAGAAAAAAAAABFjb25zdW1lcl9wdWJrZXlfeAAAAAAAAAwAAAAAAAAAEWNvbnN1bWVyX3B1YmtleV95AAAAAAAADAAAAAAAAAAJZGVwb3NpdG9yAAAAAAAAEwAAAAAAAAAIcHJvdmlkZXIAAAATAAAAAAAAAA9yYXRlX2NvbW1pdG1lbnQAAAAADAAAAAAAAAAFdG9rZW4AAAAAAAAT",
        "AAAAAgAAAAAAAAAAAAAADUNoYW5uZWxTdGF0dXMAAAAAAAACAAAAAAAAAAAAAAAET3BlbgAAAAAAAAAAAAAABkNsb3NlZAAA",
        "AAAAAAAAAEBSZXR1cm4gdGhlIGNoYW5uZWwgcmVjb3JkIGFuZCBsaWZlY3ljbGUgc3RhdHVzIGZvciBgY2hhbm5lbF9pZGAuAAAAC2dldF9jaGFubmVsAAAAAAEAAAAAAAAACmNoYW5uZWxfaWQAAAAAAAwAAAABAAAD6QAAB9AAAAAMQ2hhbm5lbEVudHJ5AAAAAw==",
        "AAAAAAAAADFXaGV0aGVyIGEgY2hhbm5lbCByZWNvcmQgZXhpc3RzIGZvciBgY2hhbm5lbF9pZGAuAAAAAAAAC2hhc19jaGFubmVsAAAAAAEAAAAAAAAACmNoYW5uZWxfaWQAAAAAAAwAAAABAAAAAQ==",
        "AAAAAAAAAEpNYXJrIGEgY2hhbm5lbCBjbG9zZWQuIE9ubHkgdGhlIHJlZ2lzdGVyZWQgZGVwb3NpdG9yIG9yIHByb3ZpZGVyIG1heSBjYWxsLgAAAAAADWNsb3NlX2NoYW5uZWwAAAAAAAACAAAAAAAAAApjaGFubmVsX2lkAAAAAAAMAAAAAAAAAAZjYWxsZXIAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAQFSZWdpc3RlciBhIG5ldyBwYXltZW50IGNoYW5uZWwuIFRoZSBkZXBvc2l0b3IgbXVzdCBhdXRob3JpemUgdGhlIGNhbGwuCgpgY2hhbm5lbF9pZGAgaXMgdGhlIG9wYXF1ZSBpZGVudGlmaWVyIHVzZWQgaW4gdGhlIFpLIGNpcmN1aXQgYW5kIG11c3QgYmUKdW5pcXVlLiBUaGUgc3RvcmVkIGZpZWxkcyBhcmUgdGhlIGZpeGVkIHB1YmxpYyBpbnB1dHMgdGhhdCBldmVyeQpzZXR0bGVtZW50IHByb29mIGZvciB0aGlzIGNoYW5uZWwgbXVzdCBpbmNsdWRlLgAAAAAAABByZWdpc3Rlcl9jaGFubmVsAAAABwAAAAAAAAAKY2hhbm5lbF9pZAAAAAAADAAAAAAAAAAPcmF0ZV9jb21taXRtZW50AAAAAAwAAAAAAAAAEWNvbnN1bWVyX3B1YmtleV94AAAAAAAADAAAAAAAAAARY29uc3VtZXJfcHVia2V5X3kAAAAAAAAMAAAAAAAAAAlkZXBvc2l0b3IAAAAAAAATAAAAAAAAAAhwcm92aWRlcgAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAQJBc3NlcnQgdGhhdCBgcHVibGljX3NpZ25hbHNgIGFyZSBjb25zaXN0ZW50IHdpdGggdGhlIHJlZ2lzdGVyZWQgY2hhbm5lbC4KCkludGVuZGVkIGZvciBjcm9zcy1jb250cmFjdCB1c2UgYnkgYHNsYXRlLWVzY3Jvd2AgYmVmb3JlIHNldHRsZW1lbnQ6CmNoZWNrcyBjaGFubmVsIGlzIG9wZW4sIGBwdWJsaWNfc2lnbmFsc1swXWAgbWF0Y2hlcyBgY2hhbm5lbF9pZGAsIGFuZAppbmRpY2VzIDEgYW5kIDXigJMxMiBtYXRjaCB0aGUgc3RvcmVkIHJlY29yZC4AAAAAABd2YWxpZGF0ZV9mb3Jfc2V0dGxlbWVudAAAAAACAAAAAAAAAApjaGFubmVsX2lkAAAAAAAMAAAAAAAAAA5wdWJsaWNfc2lnbmFscwAAAAAD6gAAAAwAAAABAAAD6QAAAAIAAAAD" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_channel: this.txFromJSON<Result<ChannelEntry>>,
        has_channel: this.txFromJSON<boolean>,
        close_channel: this.txFromJSON<Result<void>>,
        register_channel: this.txFromJSON<Result<void>>,
        validate_for_settlement: this.txFromJSON<Result<void>>
  }
}