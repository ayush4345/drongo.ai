import type { RejectReason } from "./provider.js";
import type { SettlementWitness, Voucher } from "./types.js";

export interface CallOutcome<Req, Res> {
  served: boolean;
  request: Req;
  voucher: Voucher;
  result?: Res;
  reason?: RejectReason | "underpaid" | string;
  cost?: bigint;
  cumulativeUnits?: bigint;
  billable?: bigint;
}

/** Shared surface for in-process and x402-backed metered service clients. */
export interface MeteredServiceChannel<Req, Res> {
  call(req: Req): Promise<CallOutcome<Req, Res>>;
  close(): SettlementWitness | Promise<SettlementWitness>;
}
