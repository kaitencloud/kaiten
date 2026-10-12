import type { BillingPeriod, BillingTiming } from './price-types';

/** Months in a billing period: what the API counts its periods in. */
export const BILLING_PERIOD_MONTHS = {
  ANNUAL: 12,
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
} as const satisfies Record<BillingPeriod, number>;

/**
 * `date` moved by `months`, in UTC, with the day clamped to the last of the
 * target month: the arithmetic the API counts its billing periods with
 * (`rating.AddMonthsClamped`), so that a date the console shows as a boundary is
 * the one the API will compose its invoice at. Jan 31 plus a month is Feb 28.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const first = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), lastDay));

  return first;
}

/**
 * The instants a subscription may start at: from one billing period ago, for a
 * contract that began before it was entered, to now. Starting later than now is
 * refused, as is starting earlier than a period back; the API has the last word,
 * to the second, and says so in its refusal.
 */
export function getSubscriptionStartBounds(
  period: BillingPeriod,
  now: Date = new Date(),
): { earliest: Date; latest: Date } {
  return {
    earliest: addMonthsClamped(now, -BILLING_PERIOD_MONTHS[period]),
    latest: now,
  };
}

/**
 * When the first invoice of a subscription is issued, which is the first thing
 * a person asks. A base price that bills in advance issues the activation
 * invoice as the subscription starts. One that bills in arrears issues nothing
 * until the first period closes, at the end of the period that starts at the
 * anchor; when that is already past (a contract entered late), the next closing
 * pass issues it at once. It says when and never how much: only the API composes
 * an invoice.
 */
export type FirstInvoiceTiming =
  | { kind: 'now' }
  | { alreadyDue: boolean; at: Date; kind: 'at-period-end' };

export function getFirstInvoiceTiming({
  billingPeriod,
  billingTiming,
  now = new Date(),
  startAt,
}: {
  billingPeriod: BillingPeriod;
  billingTiming: BillingTiming;
  now?: Date;
  /** The anchor of the periods; now when the subscription starts now. */
  startAt?: Date;
}): FirstInvoiceTiming {
  if (billingTiming === 'ADVANCE') {
    return { kind: 'now' };
  }
  // The API counts from the anchor truncated to the second.
  const anchor = new Date(Math.floor((startAt ?? now).getTime() / 1000) * 1000);
  const at = addMonthsClamped(anchor, BILLING_PERIOD_MONTHS[billingPeriod]);

  return {
    alreadyDue: at.getTime() <= now.getTime(),
    at,
    kind: 'at-period-end',
  };
}
