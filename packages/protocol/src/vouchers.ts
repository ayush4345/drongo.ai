import { createHash, timingSafeEqual } from "node:crypto";

import { type Voucher, VoucherSchema } from "./types.js";

export type VoucherSigningInput = {
  channelId: string;
  cumulativeUnits: string;
  nonce: string;
};

export type VoucherSigner = {
  publicKey(): Promise<string>;
  signVoucher(input: VoucherSigningInput): Promise<Voucher>;
  verifyVoucher(voucher: Voucher): Promise<boolean>;
};

export class DeterministicDevVoucherSigner implements VoucherSigner {
  readonly #consumerPubKey: string;

  constructor(secret: string) {
    if (secret.length === 0) {
      throw new TypeError("voucher signer secret cannot be empty");
    }

    this.#consumerPubKey = `devpub_${sha256Hex(`pub:${secret}`).slice(0, 32)}`;
  }

  async publicKey(): Promise<string> {
    return this.#consumerPubKey;
  }

  async signVoucher(input: VoucherSigningInput): Promise<Voucher> {
    const voucher = {
      ...input,
      consumerPubKey: this.#consumerPubKey,
      signature: signDeterministicVoucher(this.#consumerPubKey, input),
    };

    return VoucherSchema.parse(voucher);
  }

  async verifyVoucher(voucher: Voucher): Promise<boolean> {
    return verifyDeterministicVoucher(voucher);
  }
}

export class VoucherReplayGuard {
  readonly #lastAcceptedByChannel = new Map<string, bigint>();

  accept(voucher: Voucher):
    | { ok: true; acceptedUnits: string }
    | { ok: false; reason: "stale-voucher" } {
    const parsed = VoucherSchema.parse(voucher);
    const nextUnits = BigInt(parsed.cumulativeUnits);
    const lastUnits = this.#lastAcceptedByChannel.get(parsed.channelId) ?? 0n;

    if (nextUnits <= lastUnits) {
      return { ok: false, reason: "stale-voucher" };
    }

    this.#lastAcceptedByChannel.set(parsed.channelId, nextUnits);
    return { ok: true, acceptedUnits: parsed.cumulativeUnits };
  }
}

export function hashVoucherPayload(input: VoucherSigningInput): string {
  return sha256Hex(
    JSON.stringify({
      channelId: input.channelId,
      cumulativeUnits: input.cumulativeUnits,
      nonce: input.nonce,
    }),
  );
}

export function verifyDeterministicVoucher(voucher: Voucher): boolean {
  const parsed = VoucherSchema.parse(voucher);
  const expected = signDeterministicVoucher(parsed.consumerPubKey, parsed);

  return safeEqual(parsed.signature, expected);
}

function signDeterministicVoucher(
  consumerPubKey: string,
  input: VoucherSigningInput,
): string {
  return `devsig_${sha256Hex(
    `dev-voucher-v1:${consumerPubKey}:${hashVoucherPayload(input)}`,
  )}`;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
