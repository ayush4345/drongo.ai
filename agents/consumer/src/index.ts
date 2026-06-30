// @drongo/agent-consumer — the LLM-driven consumer agent. Given a goal, it asks
// an LLM which locations to look up, buys each weather call per-call through the
// @drongo/agent-core metered channel, and settles once with a ZK proof.

export * from "./llm.js";
export * from "./openai-client.js";
export * from "./consumer.js";
