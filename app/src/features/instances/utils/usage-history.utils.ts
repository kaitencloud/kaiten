import type { UsageHistoryRange } from '../queries/usage-history-query-options';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The most days one export of an entitlement of an instance reads: the API's. */
export const MAX_EXPORT_DAYS = 366;

/**
 * Whether the period is longer than a CSV reads. An open end is now, and an open
 * start is 30 days before the end, which is never too long: only a start typed
 * can make a period too long. The API has the last word, to the millisecond, and
 * says so in its refusal; this keeps the button from offering what it would refuse.
 */
export function isPeriodTooLongToExport(
  { from, to }: UsageHistoryRange,
  now: number = Date.now(),
): boolean {
  if (from === undefined) {
    return false;
  }
  const start = Date.parse(from);
  const end = to === undefined ? now : Date.parse(to);

  return end - start > MAX_EXPORT_DAYS * DAY_MS;
}

/**
 * The first midnight, in UTC, at or after an instant: a period is typed in whole
 * days, so the day a history can start from is this one, and an earlier midnight
 * would reach before what is kept.
 */
export function ceilToUtcDay(instant: string): string {
  const time = Date.parse(instant);
  const day = Math.ceil(time / DAY_MS) * DAY_MS;

  return new Date(day).toISOString();
}

/** What of an instance's entitlement the history needs to be opened. */
type HistoryRow = {
  entitlementName: string;
  entitlementSlug?: string | null;
  entitlementType: string;
};

/**
 * The entitlement a `?history=` names, among the rows of the instance: only a
 * counter has usage reports, so a slug that names a flag, a configuration or an
 * entitlement the instance does not have opens nothing.
 */
export function findHistoryRow<Row extends HistoryRow>(
  rows: readonly Row[],
  entitlementSlug: string | undefined,
): Row | undefined {
  return entitlementSlug === undefined
    ? undefined
    : rows.find(
        (row) =>
          row.entitlementSlug === entitlementSlug &&
          row.entitlementType === 'NUMBER',
      );
}
