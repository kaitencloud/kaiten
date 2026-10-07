import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { handleBillingProblem } from '@/domains/billing';
import { lineReportsQueryOptions } from '../queries';
import {
  getLimitChangeSeqs,
  groupReportsByWindow,
} from '../utils/usage-windows';

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

  const reports = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const windows = useMemo(() => groupReportsByWindow(reports), [reports]);
  const limitChanges = useMemo(() => getLimitChangeSeqs(reports), [reports]);
  // A refusal that came with reports already read is the next page's, which the
  // screen shows under them: only one with nothing read replaces them.
  const isOutsideRetention =
    query.isError &&
    !query.data &&
    handleBillingProblem(query.error).kind === 'outside-retention';

  return {
    isOutsideRetention,
    limitChanges,
    query,
    reportCount: reports.length,
    windows,
  };
}
