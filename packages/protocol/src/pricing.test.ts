import { describe, expect, it } from "vitest";

import {
  maxUnitsForEscrow,
  rateCommitment,
  refundForUnits,
  settlementForUnits,
} from "./pricing.js";

describe("pricing math", () => {
  it("reproduces the fixed ShadowMeter demo settlement", () => {
    const unitPrice = "0.002";
    const escrowAmount = "20";
    const finalUnits = "7431";

    expect(settlementForUnits(unitPrice, finalUnits)).toBe("14.862");
    expect(refundForUnits(escrowAmount, unitPrice, finalUnits)).toBe("5.138");
    expect(maxUnitsForEscrow(escrowAmount, unitPrice)).toBe("10000");
  });

  it("builds a stable rate commitment from price and escrow terms", () => {
    expect(rateCommitment("20", "0.002")).toBe(
      "rate:v1:escrow=20;unit=0.002;max=10000",
    );
  });
});
