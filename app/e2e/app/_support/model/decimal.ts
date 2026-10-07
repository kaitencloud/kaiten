/**
 * Exact decimal arithmetic for the mocks that stand in for the API's rating.
 * A value is an integer over a power of ten, held in BigInt, so a quantity like
 * 0.72345 and a price like 0.0002 are never rounded by a float. The mocks need
 * it to compose an invoice preview the way the API does: the console itself
 * never does arithmetic on amounts.
 */
export type Decimal = { digits: bigint; scale: number };

const TEN = 10n;

const pow10 = (exponent: number): bigint => TEN ** BigInt(exponent);

const DECIMAL = /^-?\d+(?:\.\d+)?$/;

export function parseDecimal(text: string): Decimal {
  if (!DECIMAL.test(text.trim())) {
    throw new Error(`"${text}" is not a decimal`);
  }
  const trimmed = text.trim();
  const negative = trimmed.startsWith('-');
  const [integer, fraction = ''] = trimmed.replace('-', '').split('.');
  const digits = BigInt(`${integer}${fraction}`);

  return { digits: negative ? -digits : digits, scale: fraction.length };
}

export const fromInteger = (value: number | bigint): Decimal => ({
  digits: BigInt(value),
  scale: 0,
});

export const ZERO: Decimal = fromInteger(0);

function align(left: Decimal, right: Decimal): [bigint, bigint, number] {
  const scale = Math.max(left.scale, right.scale);

  return [
    left.digits * pow10(scale - left.scale),
    right.digits * pow10(scale - right.scale),
    scale,
  ];
}

export function add(left: Decimal, right: Decimal): Decimal {
  const [a, b, scale] = align(left, right);

  return { digits: a + b, scale };
}

export function subtract(left: Decimal, right: Decimal): Decimal {
  const [a, b, scale] = align(left, right);

  return { digits: a - b, scale };
}

export function multiply(left: Decimal, right: Decimal): Decimal {
  return {
    digits: left.digits * right.digits,
    scale: left.scale + right.scale,
  };
}

export function compare(left: Decimal, right: Decimal): number {
  const [a, b] = align(left, right);

  return a < b ? -1 : a > b ? 1 : 0;
}

export const isPositive = (value: Decimal) => value.digits > 0n;

export const min = (left: Decimal, right: Decimal) =>
  compare(left, right) <= 0 ? left : right;

export const max = (left: Decimal, right: Decimal) =>
  compare(left, right) >= 0 ? left : right;

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const rounded = (magnitude * 2n + denominator) / (denominator * 2n);

  return negative ? -rounded : rounded;
}

/** `left ÷ right`, rounded half up to `places` decimals. */
export function divide(left: Decimal, right: Decimal, places: number): Decimal {
  if (right.digits === 0n) {
    return ZERO;
  }
  // left / right = (left.digits / 10^ls) / (right.digits / 10^rs); scaled by
  // 10^places this is left.digits × 10^(places + rs) / (right.digits × 10^ls).
  const numerator = left.digits * pow10(places + right.scale);
  const denominator = right.digits * pow10(left.scale);

  return { digits: roundHalfUp(numerator, denominator), scale: places };
}

/** The whole number of minor units, rounded half up on the magnitude. */
export function roundToInteger(value: Decimal): bigint {
  return roundHalfUp(value.digits, pow10(value.scale));
}

/** The shortest decimal string: no trailing zeros, no trailing point. */
export function formatDecimal(value: Decimal): string {
  const negative = value.digits < 0n;
  const magnitude = (negative ? -value.digits : value.digits)
    .toString()
    .padStart(value.scale + 1, '0');
  const integer = magnitude.slice(0, magnitude.length - value.scale);
  const fraction = magnitude.slice(magnitude.length - value.scale);
  const trimmed = fraction.replace(/0+$/, '');
  const text = trimmed ? `${integer}.${trimmed}` : integer;

  return negative && text !== '0' ? `-${text}` : text;
}

/** `130500` → `130,500`, `0.5` → `0.5`: the grouping the API writes in a description. */
export function formatGrouped(value: Decimal): string {
  const [whole, fraction] = formatDecimal(value).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return fraction ? `${grouped}.${fraction}` : grouped;
}
