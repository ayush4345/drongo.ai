import { describe, expect, it } from "vitest";

import { InMemoryEventSink, recordEvent } from "./events.js";

describe("demo events", () => {
  it("records JSONL-style events for T4", async () => {
    const sink = new InMemoryEventSink();

    await recordEvent(sink, "agent.discovered", { provider: "mock_provider" });
    await recordEvent(sink, "witness.exported", {
      path: "artifacts/demo-witness.json",
    });

    expect(sink.lines.map((line) => JSON.parse(line))).toEqual([
      expect.objectContaining({
        type: "agent.discovered",
        provider: "mock_provider",
      }),
      expect.objectContaining({
        type: "witness.exported",
        path: "artifacts/demo-witness.json",
      }),
    ]);
  });
});
