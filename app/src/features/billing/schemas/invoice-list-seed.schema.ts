import { z } from 'zod';
import { HANDOFF_STATUSES, INVOICE_STATUSES } from '@/domains/billing';
import { INVOICE_FILTER_IDS } from '../utils/invoice-filter-fields';

/**
 * What a link can open the list of invoices on: a filter already set, for a screen
 * that counts invoices to lead to them (`?status=PUSH_FAILED`,
 * `?handoffStatus=NOT_REQUIRED`). What is a view of the list (overdue, held, what
 * waits for the accounting system) is not a seed: it is `?view=`. The filters are
 * the screen's, in the browser: the URL only seeds them when the list opens, and
 * what the person then changes is not written back. A link is not an API call, so what does not
 * read as one of these is dropped, field by field.
 */
const invoiceListSeedSchema = z.object({
  handoffStatus: z.enum(HANDOFF_STATUSES).optional().catch(undefined),
  status: z.enum(INVOICE_STATUSES).optional().catch(undefined),
});

export type InvoiceListSeed = z.output<typeof invoiceListSeedSchema>;

/** The filters a search asks for, those that read as one. */
export function readInvoiceListSeed(
  search: Record<string, unknown>,
): InvoiceListSeed {
  return invoiceListSeedSchema.parse(search);
}

/** The values the filters of the list open with, by filter id. */
export function toInitialFilterValues(
  seed: InvoiceListSeed,
): Record<string, string> {
  return {
    ...(seed.handoffStatus
      ? { [INVOICE_FILTER_IDS.handoff]: seed.handoffStatus }
      : {}),
    ...(seed.status ? { [INVOICE_FILTER_IDS.status]: seed.status } : {}),
  };
}
