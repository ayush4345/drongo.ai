import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type DemoEventType =
  | "agent.discovered"
  | "x402.payment_required"
  | "x402.channel_opened"
  | "meter.voucher_accepted"
  | "meter.ceiling_reached"
  | "witness.exported";

export type DemoEvent = {
  type: DemoEventType;
  timestamp: string;
} & Record<string, unknown>;

export type EventSink = {
  append(line: string): Promise<void>;
};

export class JsonlFileEventSink implements EventSink {
  constructor(readonly path = "artifacts/events.jsonl") {}

  async append(line: string): Promise<void> {
    const resolvedPath = resolveWorkspacePath(this.path);

    await mkdir(dirname(resolvedPath), { recursive: true });
    await appendFile(resolvedPath, `${line}\n`);
  }
}

export class InMemoryEventSink implements EventSink {
  readonly lines: string[] = [];

  async append(line: string): Promise<void> {
    this.lines.push(line);
  }
}

export async function recordEvent(
  sink: EventSink,
  type: DemoEventType,
  fields: Record<string, unknown> = {},
): Promise<void> {
  await sink.append(
    JSON.stringify({
      type,
      timestamp: new Date(0).toISOString(),
      ...fields,
    } satisfies DemoEvent),
  );
}

function resolveWorkspacePath(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}
