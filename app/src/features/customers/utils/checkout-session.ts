import type { CheckoutSessionAdmin } from '@/api-client';
import { zCheckoutSessionAdmin } from '@/api-client/zod.gen';
import {
  BILLING_PERIOD_LABEL_KEYS,
  BILLING_PERIODS,
  type BillingPeriod,
} from '@/domains/billing';

/** Where an anonymous checkout stands, as the API reports it. */
export type CheckoutSessionStatus = CheckoutSessionAdmin['status'];

/**
 * Every status, in the order of a checkout's life (started, paid for, then how it ended),
 * which is the order of the contract: a status the contract adds is in the list, in the
 * URL params and in the options of the status filter without anything to remember here.
 */
export const CHECKOUT_SESSION_STATUSES =
  zCheckoutSessionAdmin.shape.status.options;

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

/** What a checkout names by an id or a slug: the words of the entity, when they are known. */
export type CheckoutLabels = {
  /** The name of each customer, by slug. */
  customers: Readonly<Record<string, string>>;
  /** The name of each instance, by slug. */
  instances: Readonly<Record<string, string>>;
  /** The label of each publishable key, by id. */
  keys: Readonly<Record<string, string>>;
  /** The name of each license, by slug. */
  licenses: Readonly<Record<string, string>>;
};

/** The slug stands for an entity whose name is not known (yet): the name is only a better way to say it. */
export const NO_CHECKOUT_LABELS: CheckoutLabels = {
  customers: {},
  instances: {},
  keys: {},
  licenses: {},
};

/** The name of an entity by its slug or id, and the slug or id itself while the name is not known. */
export const nameOrId = (
  names: Readonly<Record<string, string>>,
  id: string,
): string => names[id] ?? id;
