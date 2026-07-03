import { randomBytes } from "node:crypto";
import { computeRateCommitment, deriveConsumerPublicKey } from "@drongo/proving-setup";
import {
  X402ServiceChannel,
  createKeypairX402Signer,
  formatUnits,
  requireChainFromEnv,
  parseUnits,
} from "@drongo/agent-core";
import type { ChannelTerms, MeteredServiceChannel, ToolCall, ToolResult } from "@drongo/agent-core";
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

export interface SessionOpenOptions {
  /** Wallet-built x402 payment header for channel open (browser path). */
  paymentHeader?: string;
}

export interface SessionPrepareResult {
  channelId: string;
  consumerPublicKey: { x: string; y: string };
  rate: string;
  escrow: string;
}

export interface SessionSettlementResult {
  ok: true;
  settledAmount: string;
  refundedAmount: string;
  escrowAmount: string;
  settleTx: string;
  explorerUrl: string;
  tokenSymbol: string;
  sessionCalls: number;
  sessionBillable: string;
}

/**
 * One metered x402 session: opens escrow + a remote provider channel once,
 * serves many chat turns over the same channel, and settles on shutdown.
 */
export class AgentSession {
  #channel: MeteredServiceChannel<ToolCall, ToolResult> | undefined;
  #chain = requireChainFromEnv().chain;
  #terms: ChannelTerms | undefined;
  #prepared: SessionPrepareResult | undefined;
  #ready = false;
  #busy = false;
  #sessionBillable = 0n;
  #sessionCalls = 0;
  #byTool = new Map<string, ToolStats>();
  #tokenSymbol: string;
  #real = requireChainFromEnv();

  constructor(private readonly config: ConsumerServerConfig) {
    this.#tokenSymbol = process.env.SETTLEMENT_TOKEN_SYMBOL ?? "XLM";
  }

  get ready(): boolean {
    return this.#ready;
  }

  #x402Signer() {
    const secret = process.env.DEPOSITOR_SECRET;
    if (!secret) {
      throw new Error("DEPOSITOR_SECRET is required to sign x402 channel-open payments");
    }
    return createKeypairX402Signer(secret);
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

  async prepare(): Promise<SessionPrepareResult> {
    if (this.#ready) {
      throw new Error("session already open");
    }
    if (this.#prepared !== undefined) {
      return this.#prepared;
    }

    const rate = parseUnits(this.config.rate);
    const escrow = parseUnits(this.config.escrow);
    const real = this.#real;

    const terms: ChannelTerms = {
      channelId: randField(),
      rate,
      rateBlind: randField(),
      escrow,
      channelSecret: randField(),
      consumerPrivateKey: randomBytes(32),
      depositorPayload: real.depositorPayload,
      providerPayload: real.providerPayload,
      tokenPayload: real.tokenPayload,
    };

    const rateCommitment = await computeRateCommitment(rate, terms.rateBlind);
    const consumerPublicKey = await deriveConsumerPublicKey(terms.consumerPrivateKey);

    await this.#chain.openChannel({
      channelId: terms.channelId,
      rateCommitment,
      consumerPublicKey,
      depositor: terms.depositorPayload,
      provider: terms.providerPayload,
      token: terms.tokenPayload,
      escrow,
    });

    this.#terms = terms;
    this.#prepared = {
      channelId: terms.channelId.toString(),
      consumerPublicKey: {
        x: consumerPublicKey.x.toString(),
        y: consumerPublicKey.y.toString(),
      },
      rate: rate.toString(),
      escrow: escrow.toString(),
    };
    return this.#prepared;
  }

  async initialize(options: SessionOpenOptions = {}): Promise<void> {
    if (this.#ready) return;

    if (this.#terms === undefined) {
      await this.prepare();
    }
    const terms = this.#terms;
    if (terms === undefined || this.#prepared === undefined) {
      throw new Error("session prepare failed");
    }

    const channel = await X402ServiceChannel.open<ToolCall, ToolResult>({
      providerUrl: this.config.providerUrl,
      terms,
      signer: options.paymentHeader ? undefined : this.#x402Signer(),
      paymentHeader: options.paymentHeader,
    });

    this.#channel = channel;
    this.#sessionBillable = 0n;
    this.#sessionCalls = 0;
    this.#byTool.clear();
    this.#ready = true;
  }

  async chat(message: string): Promise<ChatResult> {
    if (!this.#ready || this.#channel === undefined) {
      throw new Error("session not ready — connect wallet and open a channel first");
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

  /** Submit one ZK proof to Soroban and close the metered session. */
  async settle(): Promise<SessionSettlementResult> {
    if (!this.#ready || this.#channel === undefined || this.#terms === undefined) {
      throw new Error("no open session to settle");
    }

    const payment = this.getPaymentSummary();
    const escrow = this.#terms.escrow;
    const terms = this.#terms;
    const channel = this.#channel;

    try {
      const settlement = await channel.close();
      const settled = await this.#chain.settle({
        settlement: settlement.serialized,
        depositor: terms.depositorPayload,
        provider: terms.providerPayload,
        token: terms.tokenPayload,
      });

      const settledUnits = settlement.serialized.publicSignals[3] ?? 0n;
      const refunded = escrow > settledUnits ? escrow - settledUnits : 0n;

      return {
        ok: true,
        settledAmount: settledUnits.toString(),
        refundedAmount: refunded.toString(),
        escrowAmount: escrow.toString(),
        settleTx: settled.settleTx,
        explorerUrl: `https://stellar.expert/explorer/testnet/tx/${settled.settleTx}`,
        tokenSymbol: this.#tokenSymbol,
        sessionCalls: payment.sessionCalls,
        sessionBillable: payment.sessionBillable,
      };
    } finally {
      this.#ready = false;
      this.#channel = undefined;
      this.#terms = undefined;
      this.#prepared = undefined;
      this.#sessionBillable = 0n;
      this.#sessionCalls = 0;
      this.#byTool.clear();
    }
  }

  async shutdown(): Promise<void> {
    if (!this.#ready) return;

    try {
      const result = await this.settle();
      console.log(
        `settled to provider:     ${formatUnits(BigInt(result.settledAmount))} ${result.tokenSymbol}`,
      );
      console.log(
        `refunded to consumer:    ${formatUnits(BigInt(result.refundedAmount))} ${result.tokenSymbol}`,
      );
      console.log(`settle tx:               ${result.settleTx}`);
      console.log(`view on explorer:        ${result.explorerUrl}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes("nothing to settle")) {
        console.error("session shutdown settlement failed:", msg);
      }
    }
  }
}
