import type { InvoicePreview } from '@/api-client';

/**
 * Which boundary an invoice bills: the first period of a subscription, a period
 * that ended and the one that starts, or what is left when a subscription ends.
 */
export type InvoiceKind = InvoicePreview['kind'];

export const INVOICE_KINDS = [
  'ACTIVATION',
  'RENEWAL',
  'FINAL',
] as const satisfies readonly InvoiceKind[];

const KIND_LABEL_KEYS = {
  ACTIVATION: 'Features.Billing.InvoiceKind.ACTIVATION',
  RENEWAL: 'Features.Billing.InvoiceKind.RENEWAL',
  FINAL: 'Features.Billing.InvoiceKind.FINAL',
} as const satisfies Record<InvoiceKind, string>;

export const getInvoiceKindLabelKey = (kind: InvoiceKind) =>
  KIND_LABEL_KEYS[kind];
