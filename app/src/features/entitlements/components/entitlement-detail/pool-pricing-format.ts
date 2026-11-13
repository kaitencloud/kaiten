/**
 * How the pool Pricing tab writes the engine's numbers. Display only: the
 * values come from the pricing engine, these functions only choose digits.
 */

const formats = new Map<string, Intl.NumberFormat>();

function formatter(
  locale: string,
  key: string,
  options: Intl.NumberFormatOptions,
) {
  const id = `${locale}:${key}`;
  let format = formats.get(id);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    formats.set(id, format);
  }
  return format;
}

/** A grant in credits: whole numbers, grouped. */
export function formatCreditAmount(value: number, locale: string): string {
  return formatter(locale, 'credits', { maximumFractionDigits: 2 }).format(
    value,
  );
}

/**
 * USD per credit: three significant digits, so that $0.0000400 and $0.0600
 * stay comparable across five orders of magnitude.
 */
export function formatUsdPerCredit(value: string, locale: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return formatter(locale, 'usd-per-credit', {
    style: 'currency',
    currency: 'USD',
    minimumSignificantDigits: 3,
    maximumSignificantDigits: 3,
  }).format(amount);
}
