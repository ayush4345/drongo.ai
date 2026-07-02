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
import type { AgentRunResult, ProviderSettlement, TurnPayment } from "./agent.js";
import { StubAgentBrain } from "./stub-agent.js";
import { OpenAiAgentBrain } from "./openai-agent.js";
import type { ConsumerServerConfig } from "./config.js";
import { TOOL_PROVIDERS } from "./providers.js";

function randField(): bigint {
  return BigInt("0x" + randomBytes(31).toString("hex"));
}

type ToolStats = { sessionCalls: number; sessionBillable: bigint };

export interface ChatResult extends AgentRunResult {
  payment: TurnPayment;
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
  #sessionBillable = 0n;
  #sessionCalls = 0;
  #byTool = new Map<string, ToolStats>();
  #tokenSymbol: string;

  constructor(private readonly config: ConsumerServerConfig) {
    this.#tokenSymbol = process.env.SETTLEMENT_TOKEN_SYMBOL ?? "XLM";
  }

  get ready(): boolean {
    return this.#ready;
  }

  #buildProviderSettlements(turnCounts: Map<string, number>): ProviderSettlement[] {
    const rate = this.#terms?.rate ?? 0n;
    const providers: ProviderSettlement[] = [];

    for (const [tool, meta] of Object.entries(TOOL_PROVIDERS)) {
      const turnCalls = turnCounts.get(tool) ?? 0;
      const stats = this.#byTool.get(tool) ?? { sessionCalls: 0, sessionBillable: 0n };
      providers.push({
        providerId: meta.id,
        providerLabel: meta.label,
        tool,
        turnCalls,
        turnBillable: (BigInt(turnCalls) * rate).toString(),
        sessionCalls: stats.sessionCalls,
        sessionBillable: stats.sessionBillable.toString(),
      });
    }

    return providers.sort((a, b) => a.providerLabel.localeCompare(b.providerLabel));
  }

  #allSessionProviders(): ProviderSettlement[] {
    const providers: ProviderSettlement[] = [];
    for (const [tool, meta] of Object.entries(TOOL_PROVIDERS)) {
      const stats = this.#byTool.get(tool) ?? { sessionCalls: 0, sessionBillable: 0n };
      providers.push({
        providerId: meta.id,
        providerLabel: meta.label,
        tool,
        turnCalls: 0,
        turnBillable: "0",
        sessionCalls: stats.sessionCalls,
        sessionBillable: stats.sessionBillable.toString(),
      });
    }
    return providers.sort((a, b) => a.providerLabel.localeCompare(b.providerLabel));
  }

  getPaymentSummary(): TurnPayment {
    return {
      turnCalls: 0,
      turnBillable: "0",
      sessionCalls: this.#sessionCalls,
      sessionBillable: this.#sessionBillable.toString(),
      tokenSymbol: this.#tokenSymbol,
      providers: this.#allSessionProviders(),
    };
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
    this.#sessionBillable = 0n;
    this.#sessionCalls = 0;
    this.#byTool.clear();
    this.#ready = true;
  }

  async chat(message: string): Promise<ChatResult> {
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
      const result = await new ServiceAgent(this.#channel, brain, TOOL_SPECS).run(message.trim());

      const served = result.calls.filter((c) => c.served);
      const rate = this.#terms?.rate ?? 0n;
      const turnCounts = new Map<string, number>();

      for (const call of served) {
        turnCounts.set(call.tool, (turnCounts.get(call.tool) ?? 0) + 1);
        const prev = this.#byTool.get(call.tool) ?? { sessionCalls: 0, sessionBillable: 0n };
        prev.sessionCalls += 1;
        prev.sessionBillable += rate;
        this.#byTool.set(call.tool, prev);
      }

      const turnCalls = served.length;
      const lastBillable = served.at(-1)?.billable;
      const turnBillable =
        lastBillable !== undefined
          ? BigInt(lastBillable) - this.#sessionBillable
          : BigInt(turnCalls) * rate;

      if (lastBillable !== undefined) {
        this.#sessionBillable = BigInt(lastBillable);
      } else {
        this.#sessionBillable += turnBillable;
      }
      this.#sessionCalls += turnCalls;

      const payment: TurnPayment = {
        turnCalls,
        turnBillable: turnBillable.toString(),
        sessionCalls: this.#sessionCalls,
        sessionBillable: this.#sessionBillable.toString(),
        tokenSymbol: this.#tokenSymbol,
        providers: this.#buildProviderSettlements(turnCounts),
      };

      return { ...result, payment };
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
