import type { UsageReport } from '@/api-client';
import { addDecimalStrings, floorDecimalAtZero } from '@/lib/decimal';

/** The reports of one reset window of the usage journal, and what they sum to. */
export type UsageWindow = {
  /** End of the window, excluded; absent for an entitlement that never resets. */
  end?: string;
  key: string;
  /** The reports of the window, in report order. */
  reports: UsageReport[];
  /** Start of the window; absent for an entitlement that never resets. */
  start?: string;
  /** What the reports move the usage by, summed and floored at zero as a window is. */
  sumDelta: string;
  /** What they move the usage above the limit by, summed and floored at zero. */
  sumOverageDelta: string;
};

/**
 * The reports behind a line grouped by the window they counted in. A window is
 * the period an entitlement resets over (a month, a day), so the usage of a line
 * is the sum of its windows, each floored at zero, and a line that spans two
 * months has two sums to read. The sums are of the reports given: when the page
 * is not whole, the last window is not either, and the screen says so.
 *
 * The sums are of usage, in measured units, not of money: the line's amount is
 * the API's.
 */
export function groupReportsByWindow(
  reports: readonly UsageReport[],
): UsageWindow[] {
  const windows: UsageWindow[] = [];
  const byKey = new Map<string, UsageWindow>();

  for (const report of reports) {
    const key = `${report.windowStart ?? ''}|${report.windowEnd ?? ''}`;
    let window = byKey.get(key);
    if (!window) {
      window = {
        end: report.windowEnd,
        key,
        reports: [],
        start: report.windowStart,
        sumDelta: '0',
        sumOverageDelta: '0',
      };
      byKey.set(key, window);
      windows.push(window);
    }
    window.reports.push(report);
    window.sumDelta = addDecimalStrings(window.sumDelta, report.delta);
    window.sumOverageDelta = addDecimalStrings(
      window.sumOverageDelta,
      report.overageDelta,
    );
  }

  // A window counts for what is left of it once it is floored.
  return windows.map((window) => ({
    ...window,
    sumDelta: floorDecimalAtZero(window.sumDelta),
    sumOverageDelta: floorDecimalAtZero(window.sumOverageDelta),
  }));
}
