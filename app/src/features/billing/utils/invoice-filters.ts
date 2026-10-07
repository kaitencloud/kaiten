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

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The instant a date input stands for: midnight at the start of that day, in UTC,
 * as the API takes a period (`2027-03-01T00:00:00.000Z`). Nothing for an empty
 * input or one that is not a date.
 */
export function dateInputToInstant(value: string): string | undefined {
  const match = DATE_INPUT.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const instant = new Date(`${value.trim()}T00:00:00.000Z`);

  return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString();
}

/** The UTC day an instant falls on, as a date input holds it: `2027-03-01`. */
export function instantToDateInput(instant: string | undefined): string {
  const date = instant ? new Date(instant) : null;

  return date && !Number.isNaN(date.getTime())
    ? date.toISOString().slice(0, 10)
    : '';
}

/** Whether a period ends before it starts, or on the instant it starts: the API refuses it. */
export function isPeriodInvalid(
  from: string | undefined,
  to: string | undefined,
): boolean {
  return (
    from !== undefined && to !== undefined && Date.parse(from) >= Date.parse(to)
  );
}
