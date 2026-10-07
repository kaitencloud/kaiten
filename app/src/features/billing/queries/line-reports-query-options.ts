import { infiniteQueryOptions } from '@tanstack/react-query';
import { listInvoiceLineReports } from '@/api-client';
import { listInvoiceLineReportsQueryKey } from '@/api-client/@tanstack/react-query.gen';

/** The most reports a page of a line's usage holds: the API's ceiling. */
const LINE_REPORTS_PAGE_SIZE = 500;

/**
 * The usage reports a metered line was measured from, read a page at a time by
 * report number: the API answers with the number to read after, and none on the
 * last page. The generated options do not page this operation (it has no cursor),
 * so the key is the generated one, marked as a paged read as the generated
 * infinite keys are, which keeps an invalidation of the operation reaching it.
 *
 * A 422 for usage the organization no longer keeps is an answer the page reads, not
 * a failure to retry: nothing is retried.
 */
export const lineReportsQueryOptions = (invoiceId: string, lineId: string) =>
  infiniteQueryOptions({
    queryKey: [
      {
        ...listInvoiceLineReportsQueryKey({ path: { invoiceId, lineId } })[0],
        _infinite: true,
      },
    ],
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await listInvoiceLineReports({
        path: { invoiceId, lineId },
        query: { afterSeq: pageParam, limit: LINE_REPORTS_PAGE_SIZE },
        signal,
        throwOnError: true,
      });

      return data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextAfterSeq ?? undefined,
    retry: false,
    // A refusal the route's loader met is the answer: the page shows it, with a way
    // to ask again, instead of asking once more by itself behind it.
    retryOnMount: false,
  });
