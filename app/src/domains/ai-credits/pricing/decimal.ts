/**
 * Exact decimal arithmetic for AI credit pricing. Rates (up to 10 decimals),
 * credits (6) and vendor costs (12) travel as decimal strings; a binary float
 * would round them, so they become a BigInt of digits and a scale here.
 *
 * `round` mirrors shopspring/decimal's `Round`, which the server applies: half
 * away from zero (half-up for the nonnegative amounts pricing deals with).
 * `toDecimalString` mirrors its `String`: no exponent, no trailing zeros.
 */

export type Decimal = {
  /** The value's digits: the value is `digits / 10^scale`. */
  readonly digits: bigint;
  /** The number of decimals, never negative. */
  readonly scale: number;
};

const DECIMAL_TEXT = /^(-?)(\d+)(?:\.(\d+))?$/;

export const ZERO: Decimal = { digits: 0n, scale: 0 };
export const ONE: Decimal = { digits: 1n, scale: 0 };

/** A decimal string (`"12"`, `"0.0004"`, `"-1.5"`) or null when it is not one. */
export function parseDecimal(text: string | null | undefined): Decimal | null {
  if (text == null) {
    return null;
  }
  const match = DECIMAL_TEXT.exec(text);
  if (!match) {
    return null;
  }
  const [, sign, integer, fraction = ''] = match;
  const digits = BigInt(`${integer}${fraction}`);

  return { digits: sign ? -digits : digits, scale: fraction.length };
}

/**
 * A decimal as a person types it, read as the API takes it: trimmed, with a
 * decimal comma read as a point, since that is how a French keyboard types
 * "48,5". Every decimal field of the AI screens reads its input through this.
 */
export function readDecimalInput(typed: string): string {
  return typed.trim().replace(',', '.');
}

/** A safe integer (a token count, a duration in milliseconds) as a decimal. */
export function fromInteger(value: number | bigint): Decimal {
  return { digits: BigInt(value), scale: 0 };
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function rescale(value: Decimal, scale: number): bigint {
  return value.digits * pow10(scale - value.scale);
}

export function add(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);

  return { digits: rescale(left, scale) + rescale(right, scale), scale };
}

export function subtract(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);

  return { digits: rescale(left, scale) - rescale(right, scale), scale };
}

export function multiply(left: Decimal, right: Decimal): Decimal {
  return {
    digits: left.digits * right.digits,
    scale: left.scale + right.scale,
  };
}

/** `value × 10^exponent`, exactly: Go's `Shift`, for milliseconds to seconds. */
export function shift(value: Decimal, exponent: number): Decimal {
  if (exponent >= 0) {
    return { digits: value.digits * pow10(exponent), scale: value.scale };
  }

  return { digits: value.digits, scale: value.scale - exponent };
}

/** -1, 0 or 1 as `left` is below, equal to or above `right`. */
export function compare(left: Decimal, right: Decimal): -1 | 0 | 1 {
  const scale = Math.max(left.scale, right.scale);
  const a = rescale(left, scale);
  const b = rescale(right, scale);

  return a < b ? -1 : a > b ? 1 : 0;
}

export function equals(left: Decimal, right: Decimal): boolean {
  return compare(left, right) === 0;
}

export function isNegative(value: Decimal): boolean {
  return value.digits < 0n;
}

export function isPositive(value: Decimal): boolean {
  return value.digits > 0n;
}

export function maxOf(left: Decimal, right: Decimal): Decimal {
  return compare(left, right) >= 0 ? left : right;
}

export function minOf(left: Decimal, right: Decimal): Decimal {
  return compare(left, right) <= 0 ? left : right;
}

/** Integer division of `numerator` by a positive `divisor`, half away from zero. */
function divideRounded(numerator: bigint, divisor: bigint): bigint {
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / divisor;
  const remainder = magnitude % divisor;
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;

  return negative ? -rounded : rounded;
}

/** Rounded to `places` decimals, half away from zero, as Go's `Round(places)`. */
export function round(value: Decimal, places: number): Decimal {
  if (value.scale <= places) {
    return { digits: rescale(value, places), scale: places };
  }

  return {
    digits: divideRounded(value.digits, pow10(value.scale - places)),
    scale: places,
  };
}

/** Whether `value` has at most `places` significant decimals (`v == v.Round(p)`). */
export function hasAtMostPlaces(value: Decimal, places: number): boolean {
  return equals(value, round(value, places));
}

/**
 * `numerator ÷ divisor` rounded to `places` decimals, half away from zero, or
 * null when the divisor is zero.
 */
export function divide(
  numerator: Decimal,
  divisor: Decimal,
  places: number,
): Decimal | null {
  if (divisor.digits === 0n) {
    return null;
  }
  // n/10^a ÷ d/10^b = (n × 10^(b + places − a)) / d, at scale `places`.
  const exponent = divisor.scale + places - numerator.scale;
  let scaledNumerator = numerator.digits;
  let scaledDivisor = divisor.digits;
  if (exponent >= 0) {
    scaledNumerator *= pow10(exponent);
  } else {
    scaledDivisor *= pow10(-exponent);
  }
  if (scaledDivisor < 0n) {
    scaledNumerator = -scaledNumerator;
    scaledDivisor = -scaledDivisor;
  }

  return {
    digits: divideRounded(scaledNumerator, scaledDivisor),
    scale: places,
  };
}

/** The canonical text: no exponent, no trailing zeros (`"1.6"`, `"0"`, `"-5"`). */
export function toDecimalString(value: Decimal): string {
  const negative = value.digits < 0n;
  const magnitude = (negative ? -value.digits : value.digits)
    .toString()
    .padStart(value.scale + 1, '0');
  const integer = magnitude.slice(0, magnitude.length - value.scale);
  const fraction = magnitude
    .slice(magnitude.length - value.scale)
    .replace(/0+$/, '');
  const text = fraction ? `${integer}.${fraction}` : integer;

  return negative && text !== '0' ? `-${text}` : text;
}

/** Whether two decimal strings carry the same value (`"1.38"` and `"1.380000"`). */
export function sameDecimal(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = parseDecimal(left);
  const b = parseDecimal(right);

  return a !== null && b !== null && equals(a, b);
}
