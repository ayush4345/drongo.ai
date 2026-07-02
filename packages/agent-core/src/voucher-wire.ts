import type { Voucher } from "@drongo/proving-setup";

/** JSON-safe voucher for HTTP transport (bigints as decimal strings). */
export interface WireVoucher {
  channelId: string;
  totalUnits: string;
  message: string;
  consumerPublicKey: { x: string; y: string };
  signature: { R8x: string; R8y: string; S: string };
}

/** Serialize a proving-setup {@link Voucher} into its JSON wire form. */
export function serializeVoucher(v: Voucher): WireVoucher {
  return {
    channelId: v.channelId.toString(),
    totalUnits: v.totalUnits.toString(),
    message: v.message.toString(),
    consumerPublicKey: { x: v.consumerPublicKey.x.toString(), y: v.consumerPublicKey.y.toString() },
    signature: {
      R8x: v.signature.R8x.toString(),
      R8y: v.signature.R8y.toString(),
      S: v.signature.S.toString(),
    },
  };
}

/** Parse a {@link WireVoucher} back into a proving-setup {@link Voucher}. */
export function deserializeVoucher(w: WireVoucher): Voucher {
  return {
    channelId: BigInt(w.channelId),
    totalUnits: BigInt(w.totalUnits),
    message: BigInt(w.message),
    consumerPublicKey: { x: BigInt(w.consumerPublicKey.x), y: BigInt(w.consumerPublicKey.y) },
    signature: {
      R8x: BigInt(w.signature.R8x),
      R8y: BigInt(w.signature.R8y),
      S: BigInt(w.signature.S),
    },
  };
}

/** Runtime type guard for an incoming {@link WireVoucher}. */
export function isWireVoucher(value: unknown): value is WireVoucher {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.channelId !== "string" || typeof v.totalUnits !== "string") return false;
  const pk = v.consumerPublicKey as Record<string, unknown> | undefined;
  const sig = v.signature as Record<string, unknown> | undefined;
  if (typeof pk?.x !== "string" || typeof pk?.y !== "string") return false;
  return typeof sig?.R8x === "string" && typeof sig?.R8y === "string" && typeof sig?.S === "string";
}
