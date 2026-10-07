import { getAppLocale } from './app-locale';

/**
 * Quantities as the Core API carries them: decimal strings (`"172345"`,
 * `"0.52345"`), because a float would round them. They are formatted and added
 * digit for digit, with BigInt, so a quantity beyond 2^53 keeps every digit. The
 * console adds them only to show what the rows behind an invoice line come to
 * (the usage reports of a window), never to compute what an invoice is worth.
 */

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

type Parts = { digits: bigint; scale: number };

function parse(text: string): Parts | null {
  const match = DECIMAL.exec(text.trim());
  if (!match) {
    return null;
  }
  const [, sign, integer, fraction = ''] = match;
  const digits = BigInt(`${integer}${fraction}`);

  return { digits: sign ? -digits : digits, scale: fraction.length };
}

/** Whether `text` is a decimal string: digits, a point and more digits, with a sign. */
export function isDecimalString(text: string): boolean {
  return DECIMAL.test(text.trim());
}

function write({ digits, scale }: Parts): string {
  const negative = digits < 0n;
  const magnitude = (negative ? -digits : digits)
    .toString()
    .padStart(scale + 1, '0');
  const integer = magnitude.slice(0, magnitude.length - scale);
  const fraction = magnitude.slice(magnitude.length - scale).replace(/0+$/, '');
  const text = fraction ? `${integer}.${fraction}` : integer;

  return negative && text !== '0' ? `-${text}` : text;
}

/**
 * The sum of two decimal strings, exact, without trailing zeros. A text that is
 * not a decimal counts as zero.
 */
export function addDecimalStrings(left: string, right: string): string {
  const a = parse(left) ?? { digits: 0n, scale: 0 };
  const b = parse(right) ?? { digits: 0n, scale: 0 };
  const scale = Math.max(a.scale, b.scale);

  return write({
    digits:
      a.digits * 10n ** BigInt(scale - a.scale) +
      b.digits * 10n ** BigInt(scale - b.scale),
    scale,
  });
}

/** A decimal string with a negative value read as zero: a window floors at 0. */
export function floorDecimalAtZero(text: string): string {
  const parts = parse(text);

  return parts === null || parts.digits < 0n ? '0' : write(parts);
}

// Intl formats a decimal string digit for digit (ES2023); the project's lib stops
// at ES2022 and types only numbers, so the string overload is declared here.
type DecimalNumberFormat = { format(decimal: string): string };

const formats = new Map<string, DecimalNumberFormat>();

/**
 * A decimal string as the language writes a number, with its group separators and
 * every decimal it has up to twelve: `172345` is `172,345`, `0.52345` stays
 * `0.52345`. What is not a decimal is returned as it came.
 */
export function formatDecimalQuantity(
  decimal: string,
  locale: string = getAppLocale(),
): string {
  if (!isDecimalString(decimal)) {
    return decimal;
  }
  let format = formats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 12,
    }) as unknown as DecimalNumberFormat;
    formats.set(locale, format);
  }

  return format.format(decimal.trim());
}
