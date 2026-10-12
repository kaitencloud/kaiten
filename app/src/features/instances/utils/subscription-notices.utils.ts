import type { InstanceBilling } from '@/api-client';
import {
  addMonthsClamped,
  BILLING_PERIOD_MONTHS,
  type SubscriptionStatusInput,
} from '@/domains/billing';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days from `now` to an instant, rounded up so that a trial that ends in
 * five hours has one day left, and never below zero. Zero for an instant that is
 * not a date.
 */
export function getDaysUntil(instant: string, now: number = Date.now()) {
  const at = Date.parse(instant);

  return Number.isNaN(at) ? 0 : Math.max(0, Math.ceil((at - now) / DAY_MS));
}

/** Whole days from an instant to `now`, rounded down, and never below zero. */
export function getDaysSince(instant: string, now: number = Date.now()) {
  const at = Date.parse(instant);

  return Number.isNaN(at) ? 0 : Math.max(0, Math.floor((now - at) / DAY_MS));
}

/**
 * When the first invoice of a subscription in trial is issued. The trial is never
 * invoiced and its usage is never billed; when it ends, a base billed in advance
 * issues its first period at once, and one billed in arrears issues nothing until
 * the first period after the trial closes. It says when and never how much.
 */
export function getFirstInvoiceAfterTrial(
  subscription: Pick<
    InstanceBilling,
    'basePrice' | 'billingPeriod' | 'currentPeriodEnd' | 'trialEndsAt'
  >,
): string {
  const trialEnd = subscription.trialEndsAt ?? subscription.currentPeriodEnd;

  return subscription.basePrice.billingTiming === 'ADVANCE'
    ? trialEnd
    : addMonthsClamped(
        new Date(trialEnd),
        BILLING_PERIOD_MONTHS[subscription.billingPeriod],
      ).toISOString();
}

/** The notices a subscription shows above its cards, in the order they are drawn. */
export type SubscriptionNotice =
  | 'cancellation'
  | 'past-due'
  | 'scheduled-change'
  | 'trial';

/**
 * Which notices the state of a subscription calls for. A subscription that
 * ended has none: it reads in its card, with the way to subscribe it again.
 */
export function getSubscriptionNotices(
  subscription: SubscriptionStatusInput &
    Pick<InstanceBilling, 'scheduledChange'>,
): SubscriptionNotice[] {
  if (subscription.status === 'CANCELED') {
    return [];
  }
  const notices: SubscriptionNotice[] = [];
  if (subscription.status === 'PAST_DUE') {
    notices.push('past-due');
  }
  if (subscription.status === 'TRIAL') {
    notices.push('trial');
  }
  if (subscription.cancelAtPeriodEnd) {
    notices.push('cancellation');
  }
  if (subscription.scheduledChange) {
    notices.push('scheduled-change');
  }

  return notices;
}
