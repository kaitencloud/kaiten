import {
  allInvoicesOptions,
  type InvoicesQuery,
} from '@/lib/api/all-pages-query-options';

/**
 * What a list of invoices is scoped to before the console filters it: the customer
 * or the instance whose invoices it lists. The API applies it, and not the browser,
 * because it matches the slug a customer or an instance has now as well as the one
 * an invoice was composed under, which a text match on the rows cannot do.
 */
export type InvoicesScope = Pick<InvoicesQuery, 'customerSlug' | 'instanceSlug'>;

/**
 * The invoices of a scope (none: every invoice of the organization), every page of
 * them, so that the screen filters, sorts and pages them in the browser like the
 * other lists of the console. It keeps the key the generated options give the
 * operation, with the scope in it, so that the invalidation of invoices
 * (`invalidateInvoiceQueries`) reaches every list, whatever its scope. A read of
 * billing is not retried: a refusal is shown, with a way to ask again, and a retry
 * in the background would only delay it. Nor is one the route's loader met read
 * again when the screen mounts: it is the answer.
 */
export const invoicesQueryOptions = (scope: InvoicesScope = {}) => ({
  ...allInvoicesOptions(scope),
  retry: false,
  retryOnMount: false,
});
