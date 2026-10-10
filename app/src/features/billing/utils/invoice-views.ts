import type { InvoiceSummary } from '@/api-client';
import { isInvoiceOverdue } from '@/domains/billing';
import {
  HANDOFF_VIEWS,
  INVOICES_VIEWS,
  type InvoicesView,
} from '../schemas/invoices-search.schema';
import { isInvoiceHeld } from './invoice-filter-fields';

type InvoiceViewPredicate = (invoice: InvoiceSummary) => boolean;

// What each view keeps of the list of invoices. The two views of the queue are
// told by the handoff status the list already carries on every invoice, which is
// how they are counted; their rows come from the queue itself.
const VIEW_PREDICATES = {
  acknowledged: (invoice) =>
    invoice.handoffStatus === HANDOFF_VIEWS.acknowledged,
  all: () => true,
  held: isInvoiceHeld,
  overdue: (invoice) => isInvoiceOverdue(invoice),
  waiting: (invoice) => invoice.handoffStatus === HANDOFF_VIEWS.waiting,
} as const satisfies Record<InvoicesView, InvoiceViewPredicate>;

/** The invoices a view of the list keeps. */
export function invoicesOfView(
  invoices: readonly InvoiceSummary[],
  view: InvoicesView,
): InvoiceSummary[] {
  return invoices.filter(VIEW_PREDICATES[view]);
}

export type InvoicesViewCounts = Record<InvoicesView, number>;

/**
 * How many invoices each view holds, from the list of invoices alone. The console
 * holds every invoice of the scope, so the counts are exact and cost no request,
 * the two parts of the queue included: they are the invoices whose handoff status
 * is `PENDING` and `ACKNOWLEDGED`.
 */
export function countInvoicesByView(
  invoices: readonly InvoiceSummary[],
): InvoicesViewCounts {
  return Object.fromEntries(
    INVOICES_VIEWS.map((view) => [view, invoicesOfView(invoices, view).length]),
  ) as InvoicesViewCounts;
}
