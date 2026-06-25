import { describe, expect, it } from "vitest";

import { MockChainAdapter, SorobanChainAdapter } from "./chain.js";

describe("chain adapters", () => {
  it("opens mock channels with deterministic ids and tx hashes", async () => {
    const adapter = new MockChainAdapter();

    await expect(
      adapter.openChannel({
        consumer: "consumer_demo",
        provider: "mock_provider",
        escrowAmount: "20",
        unitPrice: "0.002",
        rateCommitment: "rate:v1:escrow=20;unit=0.002;max=10000",
      }),
    ).resolves.toEqual({
      channelId: "ch_mock_8b1a2bb7",
      openTx: "mock_open_tx_8b1a2bb7",
    });
  });

  it("fails fast for Soroban until T3 supplies contract details", async () => {
    const adapter = new SorobanChainAdapter();

    await expect(
      adapter.openChannel({
        consumer: "consumer_demo",
        provider: "mock_provider",
        escrowAmount: "20",
        unitPrice: "0.002",
        rateCommitment: "rate:v1:escrow=20;unit=0.002;max=10000",
      }),
    ).rejects.toThrow("Soroban open_channel adapter is not configured");
  });
});
