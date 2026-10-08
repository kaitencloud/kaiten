import {
  allInvoicesOptions,
  type InvoicesQuery,
} from '@/lib/api/all-pages-query-options';

/**
 * The invoices the filters select (none: every invoice of the organization),
 * every page of them, so that the screen sorts and pages them in the browser like
 * the other lists of the console. It keeps the key the generated options give the
 * operation, with the filters in it, so that the invalidation of invoices
 * (`invalidateInvoiceQueries`) reaches every list, whatever its filters. A read of
 * billing is not retried: a refusal is shown, with a way to ask again, and a retry
 * in the background would only delay it. Nor is one the route's loader met read
 * again when the page mounts: it is the answer.
 */
export const invoicesQueryOptions = (filters: InvoicesQuery = {}) => ({
  ...allInvoicesOptions(filters),
  retry: false,
  retryOnMount: false,
});
