import { listInvoiceLineReports } from '@/api-client';
import { listInvoiceLineReportsQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { usageReportPagesQueryOptions } from '@/domains/billing';

/** The most reports a page of a line's usage holds: the API's ceiling. */
const LINE_REPORTS_PAGE_SIZE = 500;

/**
 * The usage reports a metered line was measured from, read a page at a time by
 * report number (`usageReportPagesQueryOptions` of the billing domain, which the
 * usage history of an entitlement reads the same way). The pages are numbered from
 * report 0, and a 422 for usage the organization no longer keeps is an answer the
 * page reads, not a failure to retry.
 */
export const lineReportsQueryOptions = (invoiceId: string, lineId: string) =>
  usageReportPagesQueryOptions({
    fetchPage: async (afterSeq, signal) => {
      const { data } = await listInvoiceLineReports({
        path: { invoiceId, lineId },
        query: { afterSeq, limit: LINE_REPORTS_PAGE_SIZE },
        signal,
        throwOnError: true,
      });

      return data;
    },
    initialPageParam: 0,
    queryKey: listInvoiceLineReportsQueryKey({ path: { invoiceId, lineId } }),
  });
