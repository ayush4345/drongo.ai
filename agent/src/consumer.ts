import type { DrongoCrypto } from "./crypto.js";
import { signVoucher } from "./voucher.js";
import type { ConsumerIdentity } from "./keys.js";
import type { BabyJubPublicKey, Voucher } from "./types.js";

/**
 * Consumer agent. Consumes metered service off-chain and issues cumulative,
 * monotonic vouchers. Because each voucher carries the *running total*, the newest
 * one supersedes all prior vouchers — so settlement only ever needs a single
 * signature, which is what keeps the ZK circuit small.
 */
export class ConsumerAgent {
  private cumulative = 0n;

  constructor(
    private readonly crypto: DrongoCrypto,
    private readonly identity: ConsumerIdentity,
    private readonly channelId: bigint,
  ) {}

  /** Units consumed so far across the channel's lifetime. */
  get cumulativeUnits(): bigint {
    return this.cumulative;
  }

  get publicKey(): BabyJubPublicKey {
    return this.identity.publicKey;
  }

  /**
   * Consume `units` more service and return a freshly signed cumulative voucher.
   * This is the consumer's payment authorization for everything consumed up to now.
   */
  signFor(units: bigint): Voucher {
    if (units <= 0n) throw new Error("units consumed must be positive");
    this.cumulative += units;
    return signVoucher(this.crypto, this.identity.privateKey, this.channelId, this.cumulative);
  }
}
