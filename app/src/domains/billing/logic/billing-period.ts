import type { Price } from '@/api-client';

/** How a flat fee is charged over time (`Price.billingPeriod`). */
export type BillingPeriod = NonNullable<Price['billingPeriod']>;

/** How a price is charged against its period (`Price.billingTiming`). */
export type BillingTiming = Price['billingTiming'];

export const BILLING_PERIODS = [
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUAL',
  'ANNUAL',
] as const satisfies readonly BillingPeriod[];

/** Months in a billing period: what the API counts its periods in. */
export const BILLING_PERIOD_MONTHS = {
  ANNUAL: 12,
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
} as const satisfies Record<BillingPeriod, number>;

// The words of a price are the license page's, so that a price reads the same
// wherever it is shown: one vocabulary, in both languages.
const BILLING_PERIOD_LABEL_KEYS = {
  ANNUAL: 'Pages.Licenses.Prices.Periods.ANNUAL',
  MONTHLY: 'Pages.Licenses.Prices.Periods.MONTHLY',
  QUARTERLY: 'Pages.Licenses.Prices.Periods.QUARTERLY',
  SEMI_ANNUAL: 'Pages.Licenses.Prices.Periods.SEMI_ANNUAL',
} as const satisfies Record<BillingPeriod, string>;

/** The translation key of a billing period ("Monthly"). */
export function getBillingPeriodLabelKey(period: BillingPeriod): string {
  return BILLING_PERIOD_LABEL_KEYS[period];
}

const BILLING_PERIOD_SUFFIX_KEYS = {
  ANNUAL: 'Pages.Licenses.Prices.PeriodSuffix.ANNUAL',
  MONTHLY: 'Pages.Licenses.Prices.PeriodSuffix.MONTHLY',
  QUARTERLY: 'Pages.Licenses.Prices.PeriodSuffix.QUARTERLY',
  SEMI_ANNUAL: 'Pages.Licenses.Prices.PeriodSuffix.SEMI_ANNUAL',
} as const satisfies Record<BillingPeriod, string>;

/** The translation key of what follows an amount charged over a period ("/month"): it sticks to the amount. */
export function getBillingPeriodSuffixKey(period: BillingPeriod): string {
  return BILLING_PERIOD_SUFFIX_KEYS[period];
}

const BILLING_TIMING_LABEL_KEYS = {
  ADVANCE: 'Pages.Licenses.Prices.Timings.ADVANCE.label',
  ARREARS: 'Pages.Licenses.Prices.Timings.ARREARS.label',
} as const satisfies Record<BillingTiming, string>;

/** The translation key of when a price is billed against its period ("In advance"). */
export function getBillingTimingLabelKey(timing: BillingTiming): string {
  return BILLING_TIMING_LABEL_KEYS[timing];
}

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
