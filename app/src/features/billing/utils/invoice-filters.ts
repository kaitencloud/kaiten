import type { InvoiceExportFilters } from '@/domains/billing';
import type { InvoiceFilters } from '../schemas/invoice-filters.schema';

const FILTER_KEYS = [
  'status',
  'kind',
  'providerKind',
  'handoffStatus',
  'overdue',
  'held',
  'customerSlug',
  'instanceSlug',
  'boundaryFrom',
  'boundaryTo',
  'issuedFrom',
  'issuedTo',
] as const satisfies readonly (keyof InvoiceFilters)[];

/**
 * The filters as the query of the API takes them: the ones that are set, and
 * nothing for the others. The same object is the query of the list and of its
 * export, so that the file holds what the screen shows.
 */
export function invoiceFiltersToQuery(
  filters: InvoiceFilters,
): InvoiceExportFilters {
  return Object.fromEntries(
    FILTER_KEYS.flatMap((key) =>
      filters[key] === undefined ? [] : [[key, filters[key]]],
    ),
  );
}

/** How many filters are set: the dates of a period count one each, as they read as one. */
export function countActiveInvoiceFilters(filters: InvoiceFilters): number {
  return FILTER_KEYS.filter((key) => filters[key] !== undefined).length;
}

export const hasActiveInvoiceFilters = (filters: InvoiceFilters) =>
  countActiveInvoiceFilters(filters) > 0;
