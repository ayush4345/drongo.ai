const MICRO_UNITS = 1_000_000n;
const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/;

export function settlementForUnits(unitPrice: string, units: string): string {
  const priceMicros = parseDecimalToMicros(unitPrice);
  const unitCount = parseInteger(units);

  return formatMicros(priceMicros * unitCount);
}

export function refundForUnits(
  escrowAmount: string,
  unitPrice: string,
  units: string,
): string {
  const escrowMicros = parseDecimalToMicros(escrowAmount);
  const settlementMicros = parseDecimalToMicros(
    settlementForUnits(unitPrice, units),
  );
  const refundMicros = escrowMicros - settlementMicros;

  if (refundMicros < 0n) {
    throw new RangeError("settlement exceeds escrow amount");
  }

  return formatMicros(refundMicros);
}

export function maxUnitsForEscrow(
  escrowAmount: string,
  unitPrice: string,
): string {
  const escrowMicros = parseDecimalToMicros(escrowAmount);
  const priceMicros = parseDecimalToMicros(unitPrice);

  if (priceMicros <= 0n) {
    throw new RangeError("unit price must be greater than zero");
  }

  return (escrowMicros / priceMicros).toString();
}

export function rateCommitment(
  escrowAmount: string,
  unitPrice: string,
): string {
  return `rate:v1:escrow=${normalizeDecimal(escrowAmount)};unit=${normalizeDecimal(
    unitPrice,
  )};max=${maxUnitsForEscrow(escrowAmount, unitPrice)}`;
}

export function parseDecimalToMicros(value: string): bigint {
  if (!DECIMAL_PATTERN.test(value)) {
    throw new TypeError(`invalid decimal string: ${value}`);
  }

  const [whole, fractional = ""] = value.split(".");
  const paddedFractional = fractional.padEnd(6, "0");

  if (paddedFractional.length > 6 && /[1-9]/.test(paddedFractional.slice(6))) {
    throw new TypeError(`decimal exceeds micro precision: ${value}`);
  }

  return BigInt(whole) * MICRO_UNITS + BigInt(paddedFractional.slice(0, 6));
}

export function formatMicros(value: bigint): string {
  if (value < 0n) {
    throw new RangeError("cannot format negative micro amount");
  }

  const whole = value / MICRO_UNITS;
  const fractional = value % MICRO_UNITS;

  if (fractional === 0n) {
    return whole.toString();
  }

  return `${whole.toString()}.${fractional
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "")}`;
}

function parseInteger(value: string): bigint {
  if (!INTEGER_PATTERN.test(value)) {
    throw new TypeError(`invalid integer string: ${value}`);
  }

  return BigInt(value);
}

function normalizeDecimal(value: string): string {
  return formatMicros(parseDecimalToMicros(value));
}
