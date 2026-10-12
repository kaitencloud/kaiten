import type { Invoice } from '@/api-client';

/**
 * Whether an invoice is in the queue the organization's accounting system reads,
 * waiting or acknowledged. An invoice that never needed handing off (nothing is
 * owed, or a payment provider collects it) is in no queue, and its page has no
 * block for it.
 */
export const isInHandoff = (invoice: Pick<Invoice, 'handoff'>): boolean =>
  invoice.handoff.status !== 'NOT_REQUIRED';
