import { queryOptions } from '@tanstack/react-query';
import { getInvoiceOptions } from '@/api-client/@tanstack/react-query.gen';
import { invoicesQueryOptions as readInvoices } from '@/domains/billing';
import type { InvoiceFilters } from '../schemas/invoice-filters.schema';
import { invoiceFiltersToQuery } from '../utils/invoice-filters';

/**
 * The list of invoices for some filters, every page of it. The read itself is the
 * domain's, shared with the invoices of a customer; this one turns the filters of
 * the screen into the query of the API.
 */
export const invoicesQueryOptions = (filters: InvoiceFilters) =>
  readInvoices(invoiceFiltersToQuery(filters));

/** One invoice, with its lines, its hold and its handoff. */
export const invoiceQueryOptions = (invoiceId: string) =>
  queryOptions({
    ...getInvoiceOptions({ path: { invoiceId } }),
    retry: false,
  });
