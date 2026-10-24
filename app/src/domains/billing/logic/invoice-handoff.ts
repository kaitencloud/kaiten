import type { InvoiceHandoff, InvoiceSummary } from '@/api-client';

/** Where an invoice stands in the queue the organization's accounting system reads. */
export type HandoffStatus = InvoiceSummary['handoffStatus'];

export const HANDOFF_STATUSES = [
  'PENDING',
  'ACKNOWLEDGED',
  'NOT_REQUIRED',
] as const satisfies readonly HandoffStatus[];

const HANDOFF_STATUS_LABEL_KEYS = {
  ACKNOWLEDGED: 'Features.Billing.HandoffStatus.ACKNOWLEDGED',
  NOT_REQUIRED: 'Features.Billing.HandoffStatus.NOT_REQUIRED',
  PENDING: 'Features.Billing.HandoffStatus.PENDING',
} as const satisfies Record<HandoffStatus, string>;

export const getHandoffStatusLabelKey = (status: HandoffStatus) =>
  HANDOFF_STATUS_LABEL_KEYS[status];

/**
 * Whether a consumer holds the invoice right now: it was claimed and its lease
 * has not run out. An expired lease is as good as none, since the invoice can
 * be claimed again.
 */
export function isHandoffLeased(
  handoff: Pick<InvoiceHandoff, 'leasedUntil' | 'status'>,
  now: number = Date.now(),
): boolean {
  if (handoff.status !== 'PENDING' || !handoff.leasedUntil) {
    return false;
  }
  const until = Date.parse(handoff.leasedUntil);

  return !Number.isNaN(until) && until > now;
}
