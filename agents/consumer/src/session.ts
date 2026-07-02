import { randomBytes } from "node:crypto";
import { computeRateCommitment, deriveConsumerPublicKey } from "@drongo/proving-setup";
import {
  X402ServiceChannel,
  MockChainClient,
  realChainFromEnv,
  parseUnits,
} from "@drongo/agent-core";
import type { ChainClient, ChannelTerms, MeteredServiceChannel, ToolCall, ToolResult } from "@drongo/agent-core";
import { TOOL_SPECS } from "@drongo/agent-provider";
import { ServiceAgent } from "./agent.js";
import type { AgentRunResult } from "./agent.js";
import { StubAgentBrain } from "./stub-agent.js";
import { OpenAiAgentBrain } from "./openai-agent.js";
import type { ConsumerServerConfig } from "./config.js";

function randField(): bigint {
  return BigInt("0x" + randomBytes(31).toString("hex"));
}

/**
 * One metered x402 session: opens escrow + a remote provider channel once,
 * serves many chat turns over the same channel, and settles on shutdown.
 */
export class AgentSession {
  #channel: MeteredServiceChannel<ToolCall, ToolResult> | undefined;
  #chain: ChainClient | undefined;
  #terms: ChannelTerms | undefined;
  #ready = false;
  #busy = false;

  constructor(private readonly config: ConsumerServerConfig) {}

  get ready(): boolean {
    return this.#ready;
  }

  async initialize(): Promise<void> {
    const rate = parseUnits(this.config.rate);
    const escrow = parseUnits(this.config.escrow);

    const real = realChainFromEnv();
    const chain: ChainClient = real?.chain ?? new MockChainClient();

    const depositorPayload = real?.depositorPayload ?? randomBytes(32);
    const providerPayload = real?.providerPayload ?? randomBytes(32);
    const tokenPayload = real?.tokenPayload ?? randomBytes(32);

    const terms: ChannelTerms = {
      channelId: randField(),
      rate,
      rateBlind: randField(),
      escrow,
      channelSecret: randField(),
      consumerPrivateKey: randomBytes(32),
      depositorPayload,
      providerPayload,
      tokenPayload,
    };

    const rateCommitment = await computeRateCommitment(rate, terms.rateBlind);
    const consumerPublicKey = await deriveConsumerPublicKey(terms.consumerPrivateKey);

    await chain.openChannel({
      channelId: terms.channelId,
      rateCommitment,
      consumerPublicKey,
      depositor: depositorPayload,
      provider: providerPayload,
      token: tokenPayload,
      escrow,
    });

    const channel = await X402ServiceChannel.open<ToolCall, ToolResult>({
      providerUrl: this.config.providerUrl,
      terms,
      paymentSignature: this.config.paymentSignature,
    });

    this.#chain = chain;
    this.#terms = terms;
    this.#channel = channel;
    this.#ready = true;
  }

  async chat(message: string): Promise<AgentRunResult> {
    if (!this.#ready || this.#channel === undefined) {
      throw new Error("session not ready");
    }
    if (this.#busy) {
      throw new Error("session busy");
    }

    this.#busy = true;
    try {
      const useOpenAi = Boolean(process.env.OPENAI_API_KEY);
      const brain = useOpenAi ? new OpenAiAgentBrain() : new StubAgentBrain();
      return await new ServiceAgent(this.#channel, brain, TOOL_SPECS).run(message.trim());
    } finally {
      this.#busy = false;
    }
  }

  async shutdown(): Promise<void> {
    if (this.#channel === undefined || this.#terms === undefined || this.#chain === undefined) {
      return;
    }

    try {
      const settlement = await this.#channel.close();
      await this.#chain.settle({
        settlement: settlement.serialized,
        depositor: this.#terms.depositorPayload,
        provider: this.#terms.providerPayload,
        token: this.#terms.tokenPayload,
      });
    } catch {
      // No vouchers were accepted — nothing to settle.
    } finally {
      this.#ready = false;
      this.#channel = undefined;
      this.#terms = undefined;
      this.#chain = undefined;
    }
  }
}
