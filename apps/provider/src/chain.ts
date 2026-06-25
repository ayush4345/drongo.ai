import { createHash } from "node:crypto";

export type OpenChannelInput = {
  consumer: string;
  provider: string;
  escrowAmount: string;
  unitPrice: string;
  rateCommitment: string;
};

export type ChainAdapter = {
  openChannel(input: OpenChannelInput): Promise<{
    channelId: string;
    openTx: string;
  }>;
};

export class MockChainAdapter implements ChainAdapter {
  async openChannel(input: OpenChannelInput): Promise<{
    channelId: string;
    openTx: string;
  }> {
    const suffix = createHash("sha256")
      .update(
        [
          input.consumer,
          input.provider,
          input.escrowAmount,
          input.unitPrice,
          input.rateCommitment,
        ].join(":"),
      )
      .digest("hex")
      .slice(0, 8);

    return {
      channelId: `ch_mock_${suffix}`,
      openTx: `mock_open_tx_${suffix}`,
    };
  }
}

export class SorobanChainAdapter implements ChainAdapter {
  async openChannel(
    _input: OpenChannelInput,
  ): Promise<{ channelId: string; openTx: string }> {
    throw new Error(
      [
        "Soroban open_channel adapter is not configured.",
        "T3 must provide contract id, open_channel ABI, USDC/SEP-41 token address, and signer env requirements.",
      ].join(" "),
    );
  }
}
