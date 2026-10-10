import type { InstanceBilling } from '@/api-client';

/** The state of a subscription (`InstanceBilling.status`). */
export type SubscriptionStatus = InstanceBilling['status'];

export const SUBSCRIPTION_STATUSES = [
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
] as const satisfies readonly SubscriptionStatus[];

const STATUS_LABEL_KEYS = {
  TRIAL: 'Features.Billing.SubscriptionStatus.TRIAL',
  ACTIVE: 'Features.Billing.SubscriptionStatus.ACTIVE',
  PAST_DUE: 'Features.Billing.SubscriptionStatus.PAST_DUE',
  CANCELED: 'Features.Billing.SubscriptionStatus.CANCELED',
} as const satisfies Record<SubscriptionStatus, string>;

/**
 * The statuses of a subscription that bills: it issues an invoice at each
 * boundary, so what an instance holds when one comes round is what is billed. A
 * canceled subscription bills nothing more, and an instance nobody bills has none.
 */
const LIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
]);

/** Whether the subscription still bills; `null` is an instance nobody bills. */
export function isSubscriptionLive(
  subscription: Pick<InstanceBilling, 'status'> | null | undefined,
): boolean {
  return subscription != null && LIVE_STATUSES.has(subscription.status);
}

const CANCELLATION_SCHEDULED_LABEL_KEY =
  'Features.Billing.SubscriptionStatus.cancellationScheduled';

export type SubscriptionStatusInput = Pick<
  InstanceBilling,
  'cancelAtPeriodEnd' | 'status'
>;

/**
 * A subscription whose cancellation is scheduled keeps its status until the
 * period ends; it reads as what is about to happen.
 */
export function getSubscriptionStatusLabelKey(
  subscription: SubscriptionStatusInput,
): string {
  return subscription.cancelAtPeriodEnd && subscription.status !== 'CANCELED'
    ? CANCELLATION_SCHEDULED_LABEL_KEY
    : STATUS_LABEL_KEYS[subscription.status];
}

/** What a user can do to a subscription from the instance's Billing tab. */
export const SUBSCRIPTION_ACTIONS = [
  'subscribe',
  'cancel',
  'reactivate',
  'schedulePlanChange',
  'updateTerms',
  'switchProvider',
] as const;

export type SubscriptionAction = (typeof SUBSCRIPTION_ACTIONS)[number];

/**
 * - `available`: offered;
 * - `disabled`: offered, greyed out, with `reasonKey` saying why;
 * - `hidden`: not offered at all, because it makes no sense in this state.
 */
export type SubscriptionActionAvailability =
  | { availability: 'available' }
  | { availability: 'disabled'; reasonKey: string }
  | { availability: 'hidden' };

const AVAILABLE = { availability: 'available' } as const;
const HIDDEN = { availability: 'hidden' } as const;
const disabled = (reasonKey: string) =>
  ({ availability: 'disabled', reasonKey }) as const;

const REASON_TRIAL = 'Features.Billing.SubscriptionActions.Reasons.trial';
const REASON_CANCELLATION_SCHEDULED =
  'Features.Billing.SubscriptionActions.Reasons.cancellationScheduled';

/**
 * Which actions a subscription allows. `null` is an instance that was never
 * subscribed: it can only be subscribed. A CANCELED row is returned by the API
 * like any other, and the instance is subscribed again, so it offers Subscribe
 * and nothing else.
 *
 * - a TRIAL ends by cancelling, and cannot change plan (a longer trial or
 *   another plan is a cancel and a new subscription);
 * - a scheduled cancellation is reverted by Reactivate, which must come first
 *   before a plan change; it can still be cancelled at once;
 * - terms and provider apply to the next composition, so any live subscription
 *   takes them.
 *
 * It says what the state allows. Whether the session holds the scope is
 * `canPerformAction`'s answer, and whether the API accepts is the API's.
 */
export function getSubscriptionActions(
  subscription: SubscriptionStatusInput | null,
): Record<SubscriptionAction, SubscriptionActionAvailability> {
  if (subscription === null || subscription.status === 'CANCELED') {
    return {
      cancel: HIDDEN,
      reactivate: HIDDEN,
      schedulePlanChange: HIDDEN,
      subscribe: AVAILABLE,
      switchProvider: HIDDEN,
      updateTerms: HIDDEN,
    };
  }

  const { status, cancelAtPeriodEnd } = subscription;

  let schedulePlanChange: SubscriptionActionAvailability = AVAILABLE;
  if (status === 'TRIAL') {
    schedulePlanChange = disabled(REASON_TRIAL);
  } else if (cancelAtPeriodEnd) {
    schedulePlanChange = disabled(REASON_CANCELLATION_SCHEDULED);
  }

  return {
    cancel: AVAILABLE,
    reactivate: cancelAtPeriodEnd && status !== 'TRIAL' ? AVAILABLE : HIDDEN,
    schedulePlanChange,
    subscribe: HIDDEN,
    switchProvider: AVAILABLE,
    updateTerms: AVAILABLE,
  };
}
