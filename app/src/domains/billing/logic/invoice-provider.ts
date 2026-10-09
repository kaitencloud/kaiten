import type { InvoiceSummary, ProviderRecord } from '@/api-client';

/** Who collects an invoice. NoOp is the organization itself, through the handoff queue. */
export type InvoiceProviderKind = InvoiceSummary['providerKind'];

export const INVOICE_PROVIDER_KINDS = [
  'NOOP',
  'STRIPE',
] as const satisfies readonly InvoiceProviderKind[];

const PROVIDER_KIND_LABEL_KEYS = {
  NOOP: 'Features.Billing.ProviderKind.NOOP',
  STRIPE: 'Features.Billing.ProviderKind.STRIPE',
} as const satisfies Record<InvoiceProviderKind, string>;

export const getProviderKindLabelKey = (kind: InvoiceProviderKind) =>
  PROVIDER_KIND_LABEL_KEYS[kind];

/** What of an invoice tells how its push to the provider stands. */
export type InvoicePushInput = Pick<InvoiceSummary, 'status'> & {
  provider?: Pick<ProviderRecord, 'externalInvoiceId' | 'nextPushAt'>;
};

/**
 * Whether an invoice is a draft that Stripe holds and waits for a person to
 * finalize (the review mode of the connector): the push created it there and no push
 * is queued. Finalizing it is the push again, and the API does it at once.
 */
export function isAwaitingFinalization(invoice: InvoicePushInput): boolean {
  return (
    invoice.status === 'DRAFT' &&
    Boolean(invoice.provider?.externalInvoiceId) &&
    !invoice.provider?.nextPushAt
  );
}

/**
 * What pushing an invoice again means, for the words of the button:
 * - `finalize`: a draft waiting for a person in Stripe;
 * - `retry`: a push that failed;
 * - `push`: a draft the queue has not pushed yet, pushed now instead of at its time.
 */
export type PushVariant = 'finalize' | 'push' | 'retry';

export function getPushVariant(invoice: InvoicePushInput): PushVariant {
  if (invoice.status === 'PUSH_FAILED') {
    return 'retry';
  }

  return isAwaitingFinalization(invoice) ? 'finalize' : 'push';
}
