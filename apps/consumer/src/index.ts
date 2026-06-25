import { runScenario } from "./run-scenario.js";

const args = parseArgs(process.argv.slice(2));

const result = await runScenario({
  providerUrl: args.provider,
  calls: args.calls,
  out: args.out,
});

console.log(
  `Wrote witness for ${result.finalUnits} calls to ${args.out}`,
);

function parseArgs(argv: string[]): {
  provider: string;
  calls: number;
  out: string;
} {
  const values = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg.startsWith("--")) {
      values.set(arg.slice(2), argv[i + 1]);
      i += 1;
    }
  }

  return {
    provider: values.get("provider") ?? "http://localhost:4021",
    calls: Number(values.get("calls") ?? "7431"),
    out: values.get("out") ?? "artifacts/demo-witness.json",
  };
}
