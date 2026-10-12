import { getAppLocale } from './app-locale';
import { CURRENCY_EXPONENTS } from './currency-exponents';
import { logger } from './logger';

/**
 * Money as the Core API carries it: an integer in the currency's minor units
 * next to an ISO 4217 code, and a price as a decimal string in minor units
 * (`unitAmountDecimal`, at most 12 digits before the point and 12 decimals). Nothing here goes through a float:
 * an amount becomes a decimal string with BigInt, and `Intl.NumberFormat`
 * formats the string it is given, so a large amount keeps every digit and a
 * price is never rounded. The console never adds or multiplies amounts either:
 * totals are fields of the API.
 */

/** The decimals a `unitAmountDecimal` may carry, in minor units, at most. */
export const UNIT_AMOUNT_MAX_DECIMALS = 12;

/** The digits before the point a `unitAmountDecimal` may have, in minor units, at most. */
export const UNIT_AMOUNT_MAX_INTEGER_DIGITS = 12;

const DEFAULT_EXPONENT = 2;
const MINUS_SIGN = '−';

// Codes the table does not know, which are reported once each.
const reportedCurrencies = new Set<string>();

/**
 * Decimals in one unit of `currency`, as ISO 4217 gives them (JPY 0, EUR 2, KWD
 * 3), from the table of the API (`lib/currency-exponents.ts`). A code the table
 * does not know falls back to 2, and is reported once.
 */
export function getCurrencyExponent(currency: string): number {
  const code = currency.toUpperCase();
  const known = CURRENCY_EXPONENTS.get(code);
  if (known !== undefined) {
    return known;
  }

  if (!reportedCurrencies.has(code)) {
    reportedCurrencies.add(code);
    logger.warn('Unknown currency, formatted with 2 decimals', { currency });
  }

  return DEFAULT_EXPONENT;
}

/**
 * An integer in minor units as a decimal string in major ones: 2900 and 2 give
 * `29`, 580 and 2 give `5.8`, -5 and 3 give `-0.005`. BigInt keeps the digits of
 * an amount beyond 2^53 a float would round.
 */
function minorUnitsToDecimal(
  minorUnits: number | bigint,
  exponent: number,
): string {
  const value = BigInt(minorUnits);
  const negative = value < 0n;
  const digits = (negative ? -value : value)
    .toString()
    .padStart(exponent + 1, '0');
  const integer = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);

  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

/**
 * `Intl.NumberFormat` formats a decimal string digit for digit (ES2023), which is
 * the point of handing it one. The project's lib stops at ES2022 and types only
 * numbers, so the string overloads are declared here.
 */
type DecimalNumberFormat = {
  format(decimal: string): string;
  formatToParts(decimal: string): Intl.NumberFormatPart[];
};

const decimalFormat = (format: Intl.NumberFormat) =>
  format as unknown as DecimalNumberFormat;

type FractionDigits = { minimum: number; maximum: number };

// A list shows hundreds of amounts and building a formatter is the costly part
// of writing one, so each is built once. `null`: the code is not a currency.
const currencyFormats = new Map<string, DecimalNumberFormat | null>();

function currencyFormat(
  currency: string,
  fractionDigits: FractionDigits,
  locale: string,
): DecimalNumberFormat | null {
  const key = `${locale}|${currency}|${fractionDigits.minimum}|${fractionDigits.maximum}`;
  let format = currencyFormats.get(key);

  if (format === undefined) {
    try {
      format = decimalFormat(
        new Intl.NumberFormat(locale, {
          currency,
          maximumFractionDigits: fractionDigits.maximum,
          minimumFractionDigits: fractionDigits.minimum,
          style: 'currency',
        }),
      );
    } catch {
      format = null;
    }
    currencyFormats.set(key, format);
  }

  return format;
}

function formatDecimal(
  currency: string,
  decimal: string,
  fractionDigits: FractionDigits,
  locale: string,
): string {
  const format = currencyFormat(currency, fractionDigits, locale);

  if (!format) {
    // Not a currency code at all: show the amount beside whatever was sent.
    const plain = new Intl.NumberFormat(locale, {
      maximumFractionDigits: fractionDigits.maximum,
      minimumFractionDigits: fractionDigits.minimum,
    });
    return `${currency} ${decimalFormat(plain).format(decimal)}`;
  }

  // A true minus sign, whatever the locale prints.
  return format
    .formatToParts(decimal)
    .map((part) => (part.type === 'minusSign' ? MINUS_SIGN : part.value))
    .join('');
}

/**
 * An amount in minor units, as the locale writes it: `formatMoney('USD', 2900)`
 * is `$29.00`, `formatMoney('JPY', 5000)` is `¥5,000`. A negative amount (a
 * discount) carries a true minus sign.
 */
export function formatMoney(
  currency: string,
  minorUnits: number | bigint,
  locale: string = getAppLocale(),
): string {
  const exponent = getCurrencyExponent(currency);

  return formatDecimal(
    currency,
    minorUnitsToDecimal(minorUnits, exponent),
    { maximum: exponent, minimum: exponent },
    locale,
  );
}

/**
 * Drops the zeros a decimal string ends with, down to `minimumDecimals`.
 */
function trimTrailingZeros(
  integer: string,
  fraction: string,
  minimumDecimals: number,
): string {
  let end = fraction.length;
  while (end > minimumDecimals && fraction[end - 1] === '0') {
    end -= 1;
  }
  const kept = fraction.slice(0, end).padEnd(minimumDecimals, '0');

  return kept ? `${integer}.${kept}` : integer;
}

const MINOR_DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/**
 * A `unitAmountDecimal` (minor units, possibly fractional) as major units in a
 * decimal string: `150` and USD give `1.50`, `0.0002` gives `0.000002`. Null
 * when the string is not a non-negative decimal.
 */
export function minorToMajorDecimal(
  unitAmountDecimal: string,
  currency: string,
): string | null {
  const match = MINOR_DECIMAL.exec(unitAmountDecimal.trim());
  if (!match) {
    return null;
  }
  const exponent = getCurrencyExponent(currency);
  const [, integerDigits, fractionDigits = ''] = match;
  const padded = integerDigits.padStart(exponent + 1, '0');
  const integer = padded
    .slice(0, padded.length - exponent)
    .replace(/^0+(?=\d)/, '');
  const fraction = padded.slice(padded.length - exponent) + fractionDigits;

  return trimTrailingZeros(integer, fraction, exponent);
}

/**
 * A price per sale unit, as the locale writes it, with every decimal the price
 * has and none it has not: `0.0002` minor units of USD is `$0.000002`.
 */
export function formatUnitAmountDecimal(
  currency: string,
  unitAmountDecimal: string,
  locale: string = getAppLocale(),
): string {
  const major = minorToMajorDecimal(unitAmountDecimal, currency);
  if (major === null) {
    return `${currency} ${unitAmountDecimal}`;
  }
  const exponent = getCurrencyExponent(currency);
  const decimals = major.split('.')[1]?.length ?? 0;

  return formatDecimal(
    currency,
    major,
    { maximum: Math.max(decimals, exponent), minimum: exponent },
    locale,
  );
}

const MAJOR_AMOUNT = /^(\d*)(?:[.,](\d*))?$/;

/**
 * What a person typed in major units (`0.075`, `12,5`) as the `unitAmountDecimal`
 * the API takes: a decimal string in minor units, with no float on the way.
 * Null when it is not a non-negative amount, or has more decimals than a price
 * may (12 beyond the currency's own), or more digits before the point than the
 * API accepts (12, in minor units).
 */
export function majorToMinorDecimal(
  majorAmount: string,
  currency: string,
): string | null {
  const match = MAJOR_AMOUNT.exec(majorAmount.trim());
  const [, integerDigits = '', fractionDigits = ''] = match ?? [];
  if (!match || !(integerDigits || fractionDigits)) {
    return null;
  }
  const exponent = getCurrencyExponent(currency);
  if (fractionDigits.length > exponent + UNIT_AMOUNT_MAX_DECIMALS) {
    return null;
  }
  const padded = fractionDigits.padEnd(exponent, '0');
  const integer = `${integerDigits}${padded.slice(0, exponent)}`.replace(
    /^0+(?=\d)/,
    '',
  );
  if (integer.length > UNIT_AMOUNT_MAX_INTEGER_DIGITS) {
    return null;
  }

  return trimTrailingZeros(integer || '0', padded.slice(exponent), 0);
}

/** Whether `majorAmount` is something `majorToMinorDecimal` accepts. */
export function isValidMajorAmount(
  majorAmount: string,
  currency: string,
): boolean {
  return majorToMinorDecimal(majorAmount, currency) !== null;
}
