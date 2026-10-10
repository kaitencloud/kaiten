import { getAppLocale } from './app-locale';

/**
 * Locale-aware formatting helpers. Always prefer these over the bare
 * `toLocaleString`/`toLocaleDateString` methods: those use the browser
 * locale, while the app language is the i18next one.
 */

type DateInput = string | number | Date | null | undefined;

export const DEFAULT_FALLBACK = '—';

/**
 * The defaults every call site without options gets. A bare
 * `toLocaleDateString()` gave "9/10/2026" in English, which a French reader
 * takes for the 9th of October; the medium forms read the same way in both
 * languages ("Sep 10, 2026" / "10 sept. 2026").
 */
export const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};
export const DEFAULT_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
};

function toDate(value: Exclude<DateInput, null | undefined>): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateForLocale(
  value: DateInput,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
  fallback: string = DEFAULT_FALLBACK,
): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const date = toDate(value);
  if (!date) {
    return fallback;
  }
  return date.toLocaleDateString(locale, options ?? DEFAULT_DATE_OPTIONS);
}

/** Localized date (no time). Returns the fallback for nullish/invalid input. */
export function formatDate(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  fallback: string = DEFAULT_FALLBACK,
): string {
  return formatDateForLocale(value, getAppLocale(), options, fallback);
}

export function formatDateTimeForLocale(
  value: DateInput,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
  fallback: string = DEFAULT_FALLBACK,
): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const date = toDate(value);
  if (!date) {
    return fallback;
  }
  return date.toLocaleString(locale, options ?? DEFAULT_DATE_TIME_OPTIONS);
}

/** Localized date + time. Returns the fallback for nullish/invalid input. */
export function formatDateTime(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  fallback: string = DEFAULT_FALLBACK,
): string {
  return formatDateTimeForLocale(value, getAppLocale(), options, fallback);
}

/** Localized number (thousands separators follow the app language). */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return value.toLocaleString(getAppLocale(), options);
}
