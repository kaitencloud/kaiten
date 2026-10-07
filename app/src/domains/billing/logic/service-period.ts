import { getAppLocale } from '@/lib/app-locale';
import {
  DEFAULT_FALLBACK,
  formatDateForLocale,
  formatDateTimeForLocale,
} from '@/lib/format-date';

/**
 * Billing time is UTC, and half-open. A period `[from, to)` includes its start
 * and excludes its end, so it is written with the instant that ends it
 * ("Mar 1 – Apr 1, 2027"), never the last day it covers ("Mar 31"). Boundaries
 * are always shown in UTC and marked, whatever the browser's zone: an invoice
 * reads the same to everybody.
 */

const UTC_MARKER = '(UTC)';

const INSTANT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
};

const DAY_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeZone: 'UTC',
};

const parse = (value: string | undefined | null) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const isMidnightUtc = (date: Date) =>
  date.getUTCHours() === 0 &&
  date.getUTCMinutes() === 0 &&
  date.getUTCSeconds() === 0 &&
  date.getUTCMilliseconds() === 0;

// A list shows a period on every row, and building a formatter is the costly
// part of writing one, so each is built once.
const rangeFormats = new Map<string, Intl.DateTimeFormat>();

function rangeFormat(locale: string, withTime: boolean): Intl.DateTimeFormat {
  const key = `${locale}|${withTime}`;
  let format = rangeFormats.get(key);

  if (!format) {
    format = new Intl.DateTimeFormat(
      locale,
      withTime ? INSTANT_OPTIONS : DAY_OPTIONS,
    );
    rangeFormats.set(key, format);
  }

  return format;
}

/**
 * A service period as text: `Mar 1 – Apr 1, 2027 (UTC)`. The time of day is
 * shown only when a boundary is not at midnight (a subscription anchored at
 * 10:00 closes its periods at 10:00). The fallback stands for a boundary that
 * is missing or not a date.
 */
export function formatServicePeriod(
  from: string | undefined | null,
  to: string | undefined | null,
  locale: string = getAppLocale(),
): string {
  const start = parse(from);
  const end = parse(to);
  if (!start || !end) {
    return DEFAULT_FALLBACK;
  }
  const format = rangeFormat(
    locale,
    !isMidnightUtc(start) || !isMidnightUtc(end),
  );

  return `${format.formatRange(start, end)} ${UTC_MARKER}`;
}

/** One instant as text, in UTC and marked: `Mar 1, 2027, 10:00 AM (UTC)`. */
export function formatInstant(
  value: string | undefined | null,
  locale: string = getAppLocale(),
): string {
  const text = formatDateTimeForLocale(value, locale, INSTANT_OPTIONS, '');

  return text ? `${text} ${UTC_MARKER}` : DEFAULT_FALLBACK;
}

/**
 * A boundary between two periods as text, in UTC and marked: the day when it
 * falls at midnight, as the subscriptions anchored on a day do (`Apr 1, 2027
 * (UTC)`), and the moment otherwise (`Apr 1, 2027, 10:00 AM (UTC)`).
 */
export function formatBoundary(
  value: string | undefined | null,
  locale: string = getAppLocale(),
): string {
  const date = parse(value);

  return date && isMidnightUtc(date)
    ? formatUtcDate(value, locale)
    : formatInstant(value, locale);
}

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  timeStyle: 'short',
  timeZone: 'UTC',
};

/**
 * The time of day of an instant, in UTC and marked: `10:00 AM (UTC)`. For a cell
 * that gives the day on one line and the time under it.
 */
export function formatUtcTime(
  value: string | undefined | null,
  locale: string = getAppLocale(),
): string {
  const text = formatDateTimeForLocale(value, locale, TIME_OPTIONS, '');

  return text ? `${text} ${UTC_MARKER}` : DEFAULT_FALLBACK;
}

/**
 * The UTC day an instant falls on, marked: `Mar 1, 2027 (UTC)`. For a boundary
 * that is a day rather than a moment, such as where the kept usage begins.
 */
export function formatUtcDate(
  value: string | undefined | null,
  locale: string = getAppLocale(),
): string {
  const text = formatDateForLocale(value, locale, DAY_OPTIONS, '');

  return text ? `${text} ${UTC_MARKER}` : DEFAULT_FALLBACK;
}
