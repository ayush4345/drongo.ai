import { randomBytes } from "node:crypto";
import { computeRateCommitment, deriveConsumerPublicKey } from "@drongo/proving-setup";
import {
  X402ServiceChannel,
  MockChainClient,
  realChainFromEnv,
  parseUnits,
  addressToPayload,
  settlementFromSnapshot,
} from "@drongo/agent-core";
import { MeterDb } from "@drongo/agent-core/db";
import type { ChainClient, ChannelTerms, ToolCall, ToolResult, X402Requirements } from "@drongo/agent-core";
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
 * One metered x402 session. On open it DISCOVERS the provider's terms from the
 * 402 (rate, settlement address, asset), accepts the provider's rate, funds the
 * escrow with the consumer's DEPOSITOR_SECRET, persists the channel to a MeterDb,
 * serves many chat turns over the same channel, and at shutdown reads the channel
 * back from the DB and settles ONCE — paying the provider-advertised address.
 */
export class AgentSession {
  #channel: X402ServiceChannel<ToolCall, ToolResult> | undefined;
  #chain: ChainClient | undefined;
  #terms: ChannelTerms | undefined;
  #meterDb: MeterDb | undefined;
  #advertised: X402Requirements | undefined;
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

  /** The provider terms discovered from the 402 (advertised rate/address/asset). */
  getProviderTerms(): { rate?: string; address?: string; asset?: string } {
    return {
      rate: this.#advertised?.rate,
      address: this.#advertised?.payTo,
      asset: this.#advertised?.asset,
    };
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
    const escrow = parseUnits(this.config.escrow);

    // 1) Discover the provider's terms from its x402 402 response.
    const advertised = await X402ServiceChannel.discoverTerms(this.config.providerUrl);
    if (advertised === undefined) {
      throw new Error(`provider at ${this.config.providerUrl} did not advertise x402 terms`);
    }
    // The provider is the source of truth for the rate; fall back to config only
    // if the provider didn't advertise one.
    const rate = parseUnits(advertised.rate ?? this.config.rate);

    // 2) The consumer holds DEPOSITOR_SECRET and pays. The provider-advertised
    //    address + asset become the settlement recipient + token bound into the
    //    proof (overriding any consumer-side PROVIDER_PUBLIC / token env).
    const real = realChainFromEnv();
    const chain: ChainClient = real?.chain ?? new MockChainClient();

    const depositorPayload = real?.depositorPayload ?? randomBytes(32);
    const providerPayload =
      advertised.payTo !== undefined
        ? addressToPayload(advertised.payTo)
        : (real?.providerPayload ?? randomBytes(32));
    const tokenPayload =
      advertised.asset !== undefined
        ? addressToPayload(advertised.asset)
        : (real?.tokenPayload ?? randomBytes(32));

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
    const meterDb = new MeterDb(process.env.METER_DB_PATH ?? "artifacts/metering.db");

    // 3) Consumer funds the escrow on-chain (depositor pays).
    const opened = await chain.openChannel({
      channelId: terms.channelId,
      rateCommitment,
      consumerPublicKey,
      depositor: depositorPayload,
      provider: providerPayload,
      token: tokenPayload,
      escrow,
    });

    // 4) x402-open the metered channel and persist the channel + advertised
    //    recipient to the MeterDb so settlement can be driven from durable state.
    const channel = await X402ServiceChannel.open<ToolCall, ToolResult>({
      providerUrl: this.config.providerUrl,
      terms,
      paymentSignature: this.config.paymentSignature,
      meterDb,
      rateCommitment,
      openTx: opened.openTx,
      serviceName: "toolbox",
    });

    this.#chain = chain;
    this.#terms = terms;
    this.#channel = channel;
    this.#meterDb = meterDb;
    this.#advertised = advertised;
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
    if (this.#terms === undefined || this.#chain === undefined || this.#meterDb === undefined) {
      return;
    }

    try {
      // Fetch the persisted channel (terms + final voucher) from the meter DB and
      // settle ONCE. The depositor (DEPOSITOR_SECRET) pays; funds go to the
      // provider-advertised address bound into the proof.
      const snapshot = this.#meterDb.loadChannel(this.#terms.channelId);
      if (snapshot?.latestVoucher !== undefined) {
        const settlement = await settlementFromSnapshot(snapshot);
        await this.#chain.settle({
          settlement: settlement.serialized,
          depositor: snapshot.terms.depositorPayload,
          provider: snapshot.terms.providerPayload,
          token: snapshot.terms.tokenPayload,
        });
      }
    } catch {
      // No vouchers accepted (or settle failed) — nothing to settle.
    } finally {
      this.#meterDb.close();
      this.#ready = false;
      this.#channel = undefined;
      this.#terms = undefined;
      this.#chain = undefined;
      this.#meterDb = undefined;
    }
  }
}
