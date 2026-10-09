import { z } from 'zod';
import { HANDOFF_STATUSES, INVOICE_STATUSES } from '@/domains/billing';
import { INVOICE_FILTER_IDS } from '../utils/invoice-filter-fields';

/**
 * What a link can open the list of invoices on: a filter already set, for a screen
 * that counts invoices to lead to them (`?held=true`, `?overdue=true`,
 * `?status=PUSH_FAILED`, `?handoffStatus=PENDING`). The filters are the screen's,
 * in the browser: the URL only seeds them when the list opens, and what the person
 * then changes is not written back. A link is not an API call, so what does not
 * read as one of these is dropped, field by field.
 */
const flag = z
  .union([z.literal(true), z.literal('true')])
  .transform(() => true as const)
  .optional()
  .catch(undefined);

const invoiceListSeedSchema = z.object({
  handoffStatus: z.enum(HANDOFF_STATUSES).optional().catch(undefined),
  held: flag,
  overdue: flag,
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
    ...(seed.held ? { [INVOICE_FILTER_IDS.held]: 'true' } : {}),
    ...(seed.overdue ? { [INVOICE_FILTER_IDS.overdue]: 'true' } : {}),
    ...(seed.status ? { [INVOICE_FILTER_IDS.status]: seed.status } : {}),
  };
}
