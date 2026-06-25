const MICRO_UNITS = 1_000_000n;

/** Parse a non-negative USD decimal string into micro-USDC (6 decimals). */
export function parseUsdToMicros(value: string): bigint {
  const [whole, fractional = ""] = value.split(".");
  const padded = fractional.padEnd(6, "0").slice(0, 6);
  return BigInt(whole) * MICRO_UNITS + BigInt(padded || "0");
}

export function formatMicros(value: bigint): string {
  const whole = value / MICRO_UNITS;
  const fractional = value % MICRO_UNITS;
  if (fractional === 0n) return whole.toString();
  return `${whole.toString()}.${fractional.toString().padStart(6, "0").replace(/0+$/, "")}`;
}
