import type { InvoiceSummary } from '@/api-client';

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
