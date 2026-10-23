import type { CheckoutSessionAdmin } from '@/api-client';
import {
  BILLING_PERIOD_LABEL_KEYS,
  BILLING_PERIODS,
  type BillingPeriod,
} from '@/domains/billing';

/** Where an anonymous checkout stands, as the API reports it. */
export type CheckoutSessionStatus = CheckoutSessionAdmin['status'];

/** Every status, in the order of a checkout's life: started, paid for, then how it ended. */
export const CHECKOUT_SESSION_STATUSES = [
  'OPEN',
  'AWAITING_PAYMENT',
  'COMPLETED',
  'ABANDONED',
  'EXPIRED',
] as const satisfies readonly CheckoutSessionStatus[];

export const CHECKOUT_SESSION_STATUS_LABEL_KEYS = {
  ABANDONED: 'Pages.Customers.CheckoutSessions.Status.ABANDONED',
  AWAITING_PAYMENT: 'Pages.Customers.CheckoutSessions.Status.AWAITING_PAYMENT',
  COMPLETED: 'Pages.Customers.CheckoutSessions.Status.COMPLETED',
  EXPIRED: 'Pages.Customers.CheckoutSessions.Status.EXPIRED',
  OPEN: 'Pages.Customers.CheckoutSessions.Status.OPEN',
} as const satisfies Record<CheckoutSessionStatus, string>;

/**
 * Whether a checkout created a customer and an instance that outlive it. The completion
 * runs for a COMPLETED checkout and for an EXPIRED one, whose customer and instance stay
 * where they are: the vendor deletes them.
 */
export const isExpiredWithRecords = (
  session: Pick<CheckoutSessionAdmin, 'customerSlug' | 'status'>,
): boolean => session.status === 'EXPIRED' && Boolean(session.customerSlug);

const isKnownPeriod = (period: string): period is BillingPeriod =>
  (BILLING_PERIODS as readonly string[]).includes(period);

/**
 * The label key of a billing period. The contract types the period of a checkout as a
 * plain string, so a period this version of the console does not know has no key and
 * reads as it was sent.
 */
export function getPeriodLabelKey(period: string): string | undefined {
  return isKnownPeriod(period) ? BILLING_PERIOD_LABEL_KEYS[period] : undefined;
}
