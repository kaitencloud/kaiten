import { formatNumber } from '@/lib/format-date';

const DAY_MS = 86_400_000;

/** A ratio as a whole percentage: 0.84 reads `84`. */
export function percentOf(ratio: number | null | undefined): number | null {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) {
    return null;
  }
  return Math.round(ratio * 100);
}

/**
 * A large count in a short form: `42913` reads `42.9k`, `1157` reads `1,157`.
 * Below ten thousand the exact figure fits a card; above, the rounded one.
 */
export function compactCount(value: number): string {
  if (value < 10_000) {
    return formatNumber(value);
  }
  return formatNumber(value, { notation: 'compact', maximumFractionDigits: 1 });
}

/** A metered quantity: whole numbers as they are, decimals to two places. */
export function formatQuantity(value: number): string {
  return Number.isInteger(value)
    ? formatNumber(value)
    : formatNumber(value, { maximumFractionDigits: 2 });
}

/** Whole days from `now` to `date`; negative when the date is past. */
export function daysUntil(date: string | Date, now: Date = new Date()): number {
  const target = date instanceof Date ? date : new Date(date);
  return Math.ceil((target.getTime() - now.getTime()) / DAY_MS);
}

/** Whole days from `date` to `now`; negative when the date is ahead. */
export function daysSince(date: string | Date, now: Date = new Date()): number {
  return -daysUntil(date, now);
}

/** The day of a timestamp, as a `YYYY-MM-DD` key in UTC. */
export function dayKey(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/** Joins names the way a sentence lists them: `a, b and c`, in the locale. */
export function listNames(names: string[], locale: string): string {
  if (typeof Intl.ListFormat !== 'function') {
    return names.join(', ');
  }
  return new Intl.ListFormat(locale, {
    style: 'long',
    type: 'conjunction',
  }).format(names);
}
