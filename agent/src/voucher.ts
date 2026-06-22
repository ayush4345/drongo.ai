import type { ShadowCrypto } from "./crypto.js";
import type { BabyJubPublicKey, Voucher } from "./types.js";

/**
 * The canonical voucher message: Poseidon(channelId, cumulativeUnits).
 *
 * IMPORTANT: the circuit recomputes exactly this hash from its `channelId` and
 * `totalUnits` signals before checking the signature. If you change the inputs or
 * their order here, the circuit must change in lockstep.
 */
export function voucherMessage(
  crypto: ShadowCrypto,
  channelId: bigint,
  cumulativeUnits: bigint,
): bigint {
  return crypto.poseidon([channelId, cumulativeUnits]);
}

/** Produce a signed cumulative voucher for the given running total. */
export function signVoucher(
  crypto: ShadowCrypto,
  privateKey: Buffer,
  channelId: bigint,
  cumulativeUnits: bigint,
): Voucher {
  const msg = voucherMessage(crypto, channelId, cumulativeUnits);
  return { channelId, cumulativeUnits, signature: crypto.sign(privateKey, msg) };
}

/** Verify a voucher's signature against the consumer's public key. */
export function verifyVoucher(
  crypto: ShadowCrypto,
  voucher: Voucher,
  pub: BabyJubPublicKey,
): boolean {
  const msg = voucherMessage(crypto, voucher.channelId, voucher.cumulativeUnits);
  return crypto.verify(msg, voucher.signature, pub);
}
