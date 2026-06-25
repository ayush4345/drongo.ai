import type { EdDSASignature, Voucher } from "./types.js";

/** JSON-safe voucher for HTTP transport (bigints as decimal strings). */
export type WireVoucher = {
  channelId: string;
  cumulativeUnits: string;
  signature: { R8x: string; R8y: string; S: string };
};

export function serializeVoucher(voucher: Voucher): WireVoucher {
  const s = (value: bigint) => value.toString();
  return {
    channelId: s(voucher.channelId),
    cumulativeUnits: s(voucher.cumulativeUnits),
    signature: {
      R8x: s(voucher.signature.R8x),
      R8y: s(voucher.signature.R8y),
      S: s(voucher.signature.S),
    },
  };
}

export function deserializeVoucher(wire: WireVoucher): Voucher {
  const b = (value: string) => BigInt(value);
  const sig: EdDSASignature = {
    R8x: b(wire.signature.R8x),
    R8y: b(wire.signature.R8y),
    S: b(wire.signature.S),
  };
  return {
    channelId: b(wire.channelId),
    cumulativeUnits: b(wire.cumulativeUnits),
    signature: sig,
  };
}

export function isWireVoucher(value: unknown): value is WireVoucher {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.channelId !== "string" || typeof v.cumulativeUnits !== "string") {
    return false;
  }
  const sig = v.signature;
  if (typeof sig !== "object" || sig === null) return false;
  const s = sig as Record<string, unknown>;
  return typeof s.R8x === "string" && typeof s.R8y === "string" && typeof s.S === "string";
}
