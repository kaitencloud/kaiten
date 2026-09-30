import {
  formatDateForLocale,
  formatDateTimeForLocale,
} from '@/lib/format-date';

export const formatDetailDateTime = (value: string, locale: string) =>
  formatDateTimeForLocale(value, locale, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export const formatDate = (value: string, locale: string) =>
  formatDateForLocale(value, locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const formatDateTime = (value: string, locale: string) =>
  formatDateTimeForLocale(value, locale, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });

/**
 * Bounds of an entitlement usage window.
 *
 * Pinned to UTC, unlike every other helper here: the API defines these windows
 * on UTC boundaries, so rendering them in the viewer's zone would show a March
 * calendar month as "Feb 28 -> Mar 31" for anyone west of Greenwich -- and
 * contradict the anchor help text, which promises UTC calendar boundaries. The
 * zone name is shown so the reader knows which clock they are reading.
 */
export const formatUsageWindowBound = (value: string, locale: string) =>
  formatDateTimeForLocale(value, locale, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    timeZoneName: 'short',
    year: 'numeric',
  });

export const formatDateTimeShort = (value: string, locale: string) =>
  formatDateTimeForLocale(value, locale, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
