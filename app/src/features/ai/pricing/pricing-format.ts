import { getAppLocale } from '@/lib/app-locale';
import { formatDecimalQuantity } from '@/lib/decimal';

/**
 * How the rate card writes the engine's decimal strings. Display only: the
 * numbers are the engine's, these functions choose how many decimals to show.
 */

const formats = new Map<string, Intl.NumberFormat>();

function formatWith(
  key: string,
  options: Intl.NumberFormatOptions,
  value: number,
  locale: string,
): string {
  const id = `${locale}:${key}`;
  let format = formats.get(id);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    formats.set(id, format);
  }

  return format.format(value);
}

/** Credits: two decimals, and up to six below one credit (`0.128`). */
export function formatCredits(
  value: string,
  locale: string = getAppLocale(),
): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return value;
  }
  const small = amount !== 0 && Math.abs(amount) < 1;

  return formatWith(
    small ? 'credits-small' : 'credits',
    { minimumFractionDigits: 2, maximumFractionDigits: small ? 6 : 2 },
    amount,
    locale,
  );
}

/** US dollars: cents above a dollar, four decimals below, six below a tenth of a cent. */
export function formatUsd(
  value: string,
  locale: string = getAppLocale(),
): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return value;
  }
  const magnitude = Math.abs(amount);
  const digits =
    magnitude >= 1 || magnitude === 0 ? 2 : magnitude >= 0.001 ? 4 : 6;

  return formatWith(
    `usd-${digits}`,
    {
      style: 'currency',
      currency: 'USD',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    },
    amount,
    locale,
  );
}

/** A margin, which the engine gives as a fraction (`0.25`), as a whole percentage. */
export function formatMargin(
  fraction: string,
  locale: string = getAppLocale(),
): string {
  const value = Number(fraction);
  if (!Number.isFinite(value)) {
    return fraction;
  }

  return formatWith(
    'margin',
    { style: 'percent', maximumFractionDigits: 0 },
    value,
    locale,
  );
}

/** A rate or a quantity, with every decimal it has. */
export function formatRate(value: string, locale?: string): string {
  return formatDecimalQuantity(value, locale);
}

export function formatCount(
  value: number,
  locale: string = getAppLocale(),
): string {
  return formatWith('count', { maximumFractionDigits: 0 }, value, locale);
}

/** Whether a decimal string is below zero. */
export function isNegativeDecimal(value: string | null): boolean {
  return value !== null && value.trim().startsWith('-') && Number(value) !== 0;
}
