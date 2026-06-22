import type { ShadowCrypto } from "./crypto.js";
import { verifyVoucher } from "./voucher.js";
import type { BabyJubPublicKey, Voucher } from "./types.js";

export type RejectReason =
  | "wrong-channel"
  | "bad-signature"
  | "non-monotonic"
  | "ceiling-exceeded";

export interface ServeResult {
  accepted: boolean;
  reason?: RejectReason;
  /** Cumulative units on the voucher just processed. */
  cumulativeUnits?: bigint;
  /** cumulativeUnits * rate — the amount that would settle if the channel closed now. */
  billable?: bigint;
}

/**
 * Provider agent — the real enforcement mechanism.
 *
 * The provider knows the (private) rate and serves the next increment only against a
 * fresh signed cumulative voucher whose billable amount stays within the PUBLIC escrow
 * ceiling. Privacy is from the outside world, not between counterparties: the provider
 * legitimately sees rate and unit count and tracks the running total in plaintext.
 *
 * Worst-case bad debt is a single increment (the gap between "served" and "last signed
 * voucher"), tunable via increment size. The moment the ceiling is hit — or the consumer
 * stops co-signing — the provider halts.
 */
export class ProviderAgent {
  private latest: Voucher | null = null;
  private halted = false;

  constructor(
    private readonly crypto: ShadowCrypto,
    private readonly channelId: bigint,
    private readonly consumerPub: BabyJubPublicKey,
    private readonly rate: bigint,
    private readonly escrow: bigint,
  ) {}

  get isHalted(): boolean {
    return this.halted;
  }

  /** The highest-cumulative voucher accepted so far — what the channel settles against. */
  get latestVoucher(): Voucher | null {
    return this.latest;
  }

  /**
   * Validate a voucher and decide whether to serve against it. Accepting a voucher
   * advances the channel's settlement point; rejecting for "ceiling-exceeded" halts it.
   */
  receive(voucher: Voucher): ServeResult {
    if (voucher.channelId !== this.channelId) {
      return { accepted: false, reason: "wrong-channel" };
    }
    if (!verifyVoucher(this.crypto, voucher, this.consumerPub)) {
      return { accepted: false, reason: "bad-signature" };
    }
    const prev = this.latest?.cumulativeUnits ?? 0n;
    if (voucher.cumulativeUnits < prev) {
      // A newer voucher must never roll the meter backwards.
      return { accepted: false, reason: "non-monotonic", cumulativeUnits: voucher.cumulativeUnits };
    }
    const billable = voucher.cumulativeUnits * this.rate;
    if (billable > this.escrow) {
      this.halted = true;
      return { accepted: false, reason: "ceiling-exceeded", cumulativeUnits: voucher.cumulativeUnits, billable };
    }
    this.latest = voucher;
    return { accepted: true, cumulativeUnits: voucher.cumulativeUnits, billable };
  }
}
