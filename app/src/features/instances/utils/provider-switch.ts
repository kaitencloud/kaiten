import type { InvoiceSummary } from '@/api-client';
import type { InvoiceProviderKind } from '@/domains/billing';

/**
 * The invoices of a subscription that are not settled: the ones a change of provider
 * leaves in flight. A paid, voided or written-off invoice is final, and says nothing
 * about the switch.
 */
const OPEN_STATUSES: readonly InvoiceSummary['status'][] = [
  'DRAFT',
  'MANUAL',
  'PAYMENT_FAILED',
  'PUSH_FAILED',
  'PUSHED',
];

export const isOpenInvoice = (invoice: Pick<InvoiceSummary, 'status'>) =>
  OPEN_STATUSES.includes(invoice.status);

/**
 * What happens next to an open invoice when the subscription changes provider.
 * Every invoice keeps its own provider, collection method, terms and identifiers,
 * and the actions on it (retry, void, read back, reconcile) route to the provider
 * that issued it. The change applies from the next invoice composed.
 * - `manual`: issued for the organization's own accounts receivable; it is settled by
 *   marking it paid or writing it off, and still counts for a late payment;
 * - `held`: a draft the usage journal holds; releasing it issues it under the provider
 *   it was composed for, and recomposing it uses the provider of the subscription now;
 * - `queued`: a draft the push queue has, or a push that failed; it keeps being pushed
 *   to Stripe while Stripe stays connected;
 * - `review`: a draft Stripe holds for a person to finalize; it waits there, or for a
 *   push from here;
 * - `collected`: an invoice Stripe has accepted; Stripe collects it and Kaiten mirrors it,
 *   and Stripe cannot be disconnected meanwhile;
 * - `other`: nothing is known of it that the change would alter.
 */
export type OpenInvoiceFate =
  | 'collected'
  | 'held'
  | 'manual'
  | 'other'
  | 'queued'
  | 'review';

/**
 * How a person moves an open invoice to the new provider: none (it is on it
 * already), or one of the ways the flows of an invoice allow, each of which voids it and
 * composes its replacement, which then takes the terms and the provider of the subscription
 * as they are now.
 * - `choose`: a held draft; releasing keeps its provider, recomposing moves it;
 * - `voidAndRecompose`: void it, then recompose it;
 * - `voidDeletesDraft`: the same, and the void deletes the draft in Stripe;
 * - `voidInBoth`: void it in both systems, and only if the customer must stop paying
 *   through Stripe.
 */
export type OpenInvoiceMove =
  | 'choose'
  | 'none'
  | 'voidAndRecompose'
  | 'voidDeletesDraft'
  | 'voidInBoth';

type FateInput = Pick<InvoiceSummary, 'holdReason' | 'providerKind' | 'status'>;

/**
 * The fate of an open invoice, from its status, its provider and its hold. A draft
 * Stripe holds for a person (review mode) cannot be told from one the queue has from the
 * summary the list gives, which has no record of the provider: the caller reads the
 * invoice for that, and says so in `awaitingFinalization`.
 */
export function getOpenInvoiceFate(
  invoice: FateInput,
  awaitingFinalization = false,
): OpenInvoiceFate {
  if (invoice.status === 'DRAFT' && invoice.holdReason) {
    return 'held';
  }
  if (invoice.providerKind === 'NOOP') {
    return invoice.status === 'MANUAL' ? 'manual' : 'other';
  }
  switch (invoice.status) {
    case 'DRAFT':
      return awaitingFinalization ? 'review' : 'queued';
    case 'PUSH_FAILED':
      return 'queued';
    case 'PUSHED':
    case 'PAYMENT_FAILED':
      return 'collected';
    default:
      return 'other';
  }
}

/** How to move an invoice with this fate to `target`, the provider the subscription is going to. */
export function getOpenInvoiceMove(
  fate: OpenInvoiceFate,
  invoiceProvider: InvoiceProviderKind,
  target: InvoiceProviderKind,
): OpenInvoiceMove {
  if (invoiceProvider === target && fate !== 'held') {
    return 'none';
  }
  switch (fate) {
    case 'collected':
      return 'voidInBoth';
    case 'held':
      return 'choose';
    case 'manual':
    case 'queued':
      return 'voidAndRecompose';
    case 'review':
      return 'voidDeletesDraft';
    default:
      return 'none';
  }
}

/**
 * Whether the summary of an invoice is not enough to tell its fate: a draft that
 * Stripe collects and that is not held is either in the queue or in the provider
 * waiting for a person, which only the record of the provider says.
 */
export const needsProviderRecord = (invoice: FateInput) =>
  invoice.status === 'DRAFT' &&
  !invoice.holdReason &&
  invoice.providerKind === 'STRIPE';
