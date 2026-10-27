import type { InstanceBilling, InvoiceSummary } from '@/api-client';
import {
  addMonthsClamped,
  BILLING_PERIOD_MONTHS,
  isCheckoutAwaitingPayment,
  type SubscriptionStatusInput,
} from '@/domains/billing';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Whole days from `now` to an instant, rounded up so that a trial that ends in
 * five hours has one day left, and never below zero. Zero for an instant that is
 * not a date.
 */
export function getDaysUntil(instant: string, now: number = Date.now()) {
  const at = Date.parse(instant);

  return Number.isNaN(at) ? 0 : Math.max(0, Math.ceil((at - now) / DAY_MS));
}

/**
 * Whole hours from `now` to an instant, rounded up so that a checkout that lapses in
 * ten minutes has one hour left, and never below zero. Zero for an instant that is
 * past or not a date. A checkout waiting for its payment lives for hours, not days.
 */
export function getHoursUntil(instant: string, now: number = Date.now()) {
  const at = Date.parse(instant);

  return Number.isNaN(at) ? 0 : Math.max(0, Math.ceil((at - now) / HOUR_MS));
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

/** The statuses of an invoice that is issued or held and not settled yet. */
const UNSETTLED_INVOICE_STATUSES: ReadonlySet<InvoiceSummary['status']> =
  new Set(['DRAFT', 'MANUAL', 'PAYMENT_FAILED', 'PUSH_FAILED', 'PUSHED']);

/**
 * The activation invoice a checkout waits for the payment of: the latest one that is
 * not settled. A checkout composes it when it starts, and its payment is what moves
 * the subscription out of `INCOMPLETE`, so it is the invoice the vendor looks at,
 * and the one it may void and recompose. An older one that was voided is not it.
 */
export function getAwaitedActivation<
  Invoice extends Pick<InvoiceSummary, 'createdAt' | 'kind' | 'status'>,
>(invoices: readonly Invoice[]): Invoice | undefined {
  return [...invoices]
    .filter(
      (invoice) =>
        invoice.kind === 'ACTIVATION' &&
        UNSETTLED_INVOICE_STATUSES.has(invoice.status),
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

/** The notices a subscription shows above its cards, in the order they are drawn. */
export type SubscriptionNotice =
  | 'cancellation'
  | 'incomplete'
  | 'past-due'
  | 'scheduled-change'
  | 'trial';

/**
 * Which notices the state of a subscription calls for. A subscription that
 * ended has none: it reads in its card, with the way to subscribe it again.
 */
export function getSubscriptionNotices(
  subscription: SubscriptionStatusInput &
    Pick<InstanceBilling, 'scheduledChange'> &
    Partial<Pick<InstanceBilling, 'pendingLicenseSlug'>>,
): SubscriptionNotice[] {
  if (subscription.status === 'CANCELED') {
    return [];
  }
  // A checkout waiting for its payment is fixed until it is paid, or lapses: nothing
  // else can be going on with it, and the notice says what it waits for. So is a free
  // subscription a checkout replaces once paid, which keeps its status meanwhile.
  if (isCheckoutAwaitingPayment(subscription)) {
    return ['incomplete'];
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
