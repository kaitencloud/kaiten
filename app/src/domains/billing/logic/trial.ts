import type { BillingTiming } from './price-types';

/**
 * The longest trial the console starts a subscription with, in days. The API
 * takes any whole number from 0 and sets no upper bound, so the console sets
 * one: a trial is counted in 24-hour days from the anchor, and an absurd length
 * is a typo that would park a customer outside billing for years. A license may
 * carry a longer default; the form then asks for a shorter one in words.
 */
export const MAX_TRIAL_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether `days` is a trial length the console sends: a whole number from 0 (none) to a year. */
export function isValidTrialDays(days: number): boolean {
  return Number.isInteger(days) && days >= 0 && days <= MAX_TRIAL_DAYS;
}

/**
 * Whether a subscription pinned to a price that bills like this may start with a
 * trial. A trial on a base billed in arrears is refused by the console: the API
 * opens the first period with an activation invoice that has no line, and the
 * pass that closes the period fails on it. Until that is fixed on the API, such a
 * subscription starts with no trial, whatever the license says.
 */
export function canStartWithTrial(billingTiming: BillingTiming): boolean {
  return billingTiming === 'ADVANCE';
}

/**
 * When a trial that starts at `startAt` (now when omitted) ends: `trialDays`
 * 24-hour days from the anchor, which the API truncates to the second, in UTC.
 * The first invoice of the subscription is issued then.
 */
export function getTrialEnd({
  now = new Date(),
  startAt,
  trialDays,
}: {
  now?: Date;
  /** The anchor of the periods; now when the subscription starts now. */
  startAt?: Date;
  trialDays: number;
}): Date {
  const anchor = Math.floor((startAt ?? now).getTime() / 1000) * 1000;

  return new Date(anchor + trialDays * DAY_MS);
}
