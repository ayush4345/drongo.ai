import {
  appendFile,
  mkdir,
  writeFile as writeFileToDisk,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  type Channel,
  DeterministicDevVoucherSigner,
  type Voucher,
} from "@slate/protocol";

import { type FetchLike, fetchWithManualX402 } from "./x402-client.js";

export type RunScenarioInput = {
  providerUrl: string;
  calls: number;
  out: string;
  fetchImpl?: FetchLike;
  writeFile?: (path: string, contents: string) => Promise<void>;
  recordEvent?: (
    type: "witness.exported",
    fields: Record<string, unknown>,
  ) => Promise<void>;
};

export type RunScenarioResult = {
  channel: Channel;
  finalVoucher: Voucher;
  finalUnits: string;
  witnessBundle: unknown;
};

export async function runScenario({
  providerUrl,
  calls,
  out,
  fetchImpl = fetch,
  writeFile = writeFileDefault,
  recordEvent = recordEventDefault,
}: RunScenarioInput): Promise<RunScenarioResult> {
  const baseUrl = providerUrl.replace(/\/$/, "");
  const signer = new DeterministicDevVoucherSigner("consumer-secret");

  await readJson(fetchImpl(`${baseUrl}/.well-known/agent-card.json`));

  const openResponse = await fetchWithManualX402({
    url: `${baseUrl}/agent/open`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ consumer: await signer.publicKey() }),
    },
    fetchImpl,
  });
  const opened = (await readJson(openResponse)) as { channel: Channel };
  const channel = opened.channel;
  let finalVoucher: Voucher | undefined;

  for (let i = 1; i <= calls; i += 1) {
    const voucher = await signer.signVoucher({
      channelId: channel.channelId,
      cumulativeUnits: i.toString(),
      nonce: `n_${i}`,
    });
    const callResponse = await fetchImpl(
      `${baseUrl}/channels/${channel.channelId}/call`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voucher,
          payload: { prompt: "demo" },
        }),
      },
    );
    const callResult = (await readJson(callResponse)) as { ok: boolean };

    if (!callResult.ok) {
      throw new Error(`provider rejected voucher ${i}`);
    }

    finalVoucher = voucher;
  }

  if (finalVoucher === undefined) {
    throw new Error("scenario requires at least one metered call");
  }

  const finalizeResponse = await fetchImpl(
    `${baseUrl}/channels/${channel.channelId}/finalize`,
    { method: "POST" },
  );
  const finalized = (await readJson(finalizeResponse)) as { witnessBundle: unknown };

  await writeFile(out, `${JSON.stringify(finalized.witnessBundle, null, 2)}\n`);
  await recordEvent("witness.exported", {
    path: out,
    finalUnits: finalVoucher.cumulativeUnits,
  });

  return {
    channel,
    finalVoucher,
    finalUnits: finalVoucher.cumulativeUnits,
    witnessBundle: finalized.witnessBundle,
  };
}

async function readJson(responsePromise: Promise<Response> | Response): Promise<unknown> {
  const response = await responsePromise;

  if (!response.ok) {
    throw new Error(`request failed with HTTP ${response.status}`);
  }

  return response.json();
}

async function writeFileDefault(path: string, contents: string): Promise<void> {
  const resolvedPath = resolveWorkspacePath(path);

  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFileToDisk(resolvedPath, contents);
}

async function recordEventDefault(
  type: "witness.exported",
  fields: Record<string, unknown>,
): Promise<void> {
  const path = "artifacts/events.jsonl";
  const resolvedPath = resolveWorkspacePath(path);

  await mkdir(dirname(resolvedPath), { recursive: true });
  await appendFile(
    resolvedPath,
    `${JSON.stringify({
      type,
      timestamp: new Date(0).toISOString(),
      ...fields,
    })}\n`,
  );
}

function resolveWorkspacePath(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}
