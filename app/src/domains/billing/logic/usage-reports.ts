import type { UsageReport } from '@/api-client';

/**
 * The report numbers where the limit in force is not the one of the report before
 * it in the same window: an add-on, a boost or a change of license moved it, and
 * those are the rows that explain why an overage is not the usage minus one limit.
 */
export function getLimitChangeSeqs(
  reports: readonly UsageReport[],
): ReadonlySet<number> {
  const changed = new Set<number>();
  let previous: UsageReport | undefined;

  for (const report of reports) {
    const sameWindow =
      previous !== undefined &&
      previous.windowStart === report.windowStart &&
      previous.windowEnd === report.windowEnd;
    // The API says "null" for no limit and a client may leave the member out:
    // both are the same limit.
    if (
      sameWindow &&
      (previous?.limitValue ?? null) !== (report.limitValue ?? null)
    ) {
      changed.add(report.reportSeq);
    }
    previous = report;
  }

  return changed;
}
