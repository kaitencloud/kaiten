import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useUsageReports } from '@/domains/billing';
import { lineReportsQueryOptions } from '../queries';
import { groupReportsByWindow } from '../utils/usage-windows';

/**
 * The usage reports behind a metered line, a page at a time, with what the screen
 * reads off them: the reports grouped by the window they counted in, and the ones
 * where the limit in force moved. The grouping follows the pages read, so a window
 * that spans two pages is one group once both are in.
 *
 * Reports the API no longer keeps are an answer, not a failure: they are told
 * apart so that the screen can show what the invoice kept of them instead.
 */
export function useLineReports(invoiceId: string, lineId: string) {
  const query = useInfiniteQuery(lineReportsQueryOptions(invoiceId, lineId));
  const { limitChanges, outsideRetention, reports } = useUsageReports(query);
  const windows = useMemo(() => groupReportsByWindow(reports), [reports]);

  return {
    isOutsideRetention: outsideRetention !== null,
    limitChanges,
    query,
    windows,
  };
}
