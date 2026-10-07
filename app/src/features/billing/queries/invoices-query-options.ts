import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { listInvoices } from '@/api-client';
import {
  getInvoiceOptions,
  listInvoicesInfiniteQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import type { InvoiceFilters } from '../schemas/invoice-filters.schema';
import { invoiceFiltersToQuery } from '../utils/invoice-filters';

/** How many invoices a page of the list asks for: the API's default, and what the list shows before "Load more". */
const INVOICES_PAGE_SIZE = 50;

/**
 * The list of invoices for some filters, read a page at a time: the API pages by
 * cursor, newest first, and the list asks for the next page when it is told to.
 * It keeps the key the generated options give the operation, so that the
 * invalidation of invoices (`invalidateInvoiceQueries`) reaches every list, under
 * any filter. A read of billing is not retried: a refusal is shown, with a way to
 * ask again, and a retry in the background would only delay it.
 */
export const invoicesQueryOptions = (filters: InvoiceFilters) => {
  const query = {
    ...invoiceFiltersToQuery(filters),
    limit: INVOICES_PAGE_SIZE,
  };

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

/** One invoice, with its lines, its hold and its handoff. */
export const invoiceQueryOptions = (invoiceId: string) =>
  queryOptions({
    ...getInvoiceOptions({ path: { invoiceId } }),
    retry: false,
  });
