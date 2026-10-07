import { infiniteQueryOptions } from '@tanstack/react-query';
import { listInvoices } from '@/api-client';
import { listInvoicesInfiniteQueryKey } from '@/api-client/@tanstack/react-query.gen';
import type { InvoiceExportFilters } from '../logic/invoice-export';

/** How many invoices a page of a list asks for: the API's default, and what a list shows before "Load more". */
export const INVOICES_PAGE_SIZE = 50;

/**
 * The invoices that match some filters, read a page at a time: the API pages by
 * cursor, newest first, and the list asks for the next page when it is told to.
 * The organization's list filters them with all it offers, and the page of a
 * customer with its slug alone, so the one read serves both.
 *
 * It keeps the key the generated options give the operation, so that the
 * invalidation of invoices (`invalidateInvoiceQueries`) reaches every list, under
 * any filter. A read of billing is not retried: a refusal is shown, with a way to
 * ask again, and a retry in the background would only delay it.
 */
export const invoicesPagesQueryOptions = (filters: InvoiceExportFilters) => {
  const query = { ...filters, limit: INVOICES_PAGE_SIZE };

  return infiniteQueryOptions({
    queryKey: listInvoicesInfiniteQueryKey({ query }),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await listInvoices({
        query: { ...query, cursor: pageParam },
        signal,
        throwOnError: true,
      });

      return data;
    },
    // The first page asks for no cursor, each next one for the last page's.
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    retry: false,
    // A refusal the route's loader met is the answer: the page shows it, with a way
    // to ask again, instead of asking once more by itself behind it.
    retryOnMount: false,
  });
};
