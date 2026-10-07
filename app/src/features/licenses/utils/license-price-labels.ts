import type { Price } from '@/api-client';
import {
  type BillingModel,
  type BillingPeriod,
  type BillingTiming,
  type ResetPeriod,
} from './license-price.utils';

// Every label an enum of a price reads under is typed against the contract
// (`satisfies Record<Enum, string>`), since no check reads a key built from a
// value at run time: a value the API adds fails the type check until it reads in
// both languages.

export const BILLING_MODEL_LABEL_KEYS = {
  FLAT_FEE: 'Pages.Licenses.Prices.Models.FLAT_FEE.label',
  USAGE_BASED: 'Pages.Licenses.Prices.Models.USAGE_BASED.label',
  OVERAGE: 'Pages.Licenses.Prices.Models.OVERAGE.label',
} as const satisfies Record<BillingModel, string>;

export const BILLING_MODEL_BLURB_KEYS = {
  FLAT_FEE: 'Pages.Licenses.Prices.Models.FLAT_FEE.blurb',
  USAGE_BASED: 'Pages.Licenses.Prices.Models.USAGE_BASED.blurb',
  OVERAGE: 'Pages.Licenses.Prices.Models.OVERAGE.blurb',
} as const satisfies Record<BillingModel, string>;

export const BILLING_TIMING_LABEL_KEYS = {
  ADVANCE: 'Pages.Licenses.Prices.Timings.ADVANCE.label',
  ARREARS: 'Pages.Licenses.Prices.Timings.ARREARS.label',
} as const satisfies Record<BillingTiming, string>;

export const BILLING_TIMING_BLURB_KEYS = {
  ADVANCE: 'Pages.Licenses.Prices.Timings.ADVANCE.blurb',
  ARREARS: 'Pages.Licenses.Prices.Timings.ARREARS.blurb',
} as const satisfies Record<BillingTiming, string>;

export const BILLING_PERIOD_LABEL_KEYS = {
  MONTHLY: 'Pages.Licenses.Prices.Periods.MONTHLY',
  QUARTERLY: 'Pages.Licenses.Prices.Periods.QUARTERLY',
  SEMI_ANNUAL: 'Pages.Licenses.Prices.Periods.SEMI_ANNUAL',
  ANNUAL: 'Pages.Licenses.Prices.Periods.ANNUAL',
} as const satisfies Record<BillingPeriod, string>;

// What follows an amount: "/month". A key that starts with a slash sticks to the
// amount, any other is separated from it by a space.
export const BILLING_PERIOD_SUFFIX_KEYS = {
  MONTHLY: 'Pages.Licenses.Prices.PeriodSuffix.MONTHLY',
  QUARTERLY: 'Pages.Licenses.Prices.PeriodSuffix.QUARTERLY',
  SEMI_ANNUAL: 'Pages.Licenses.Prices.PeriodSuffix.SEMI_ANNUAL',
  ANNUAL: 'Pages.Licenses.Prices.PeriodSuffix.ANNUAL',
} as const satisfies Record<BillingPeriod, string>;

export const PRICE_STATUS_LABEL_KEYS = {
  ACTIVE: 'Pages.Licenses.Prices.Status.ACTIVE',
  DEPRECATED: 'Pages.Licenses.Prices.Status.DEPRECATED',
} as const satisfies Record<Price['status'], string>;

/** A reset period as it follows "per": "month", "day". */
export const RESET_PERIOD_UNIT_KEYS = {
  HOUR: 'Pages.Licenses.Prices.ResetUnits.HOUR',
  DAY: 'Pages.Licenses.Prices.ResetUnits.DAY',
  WEEK: 'Pages.Licenses.Prices.ResetUnits.WEEK',
  MONTH: 'Pages.Licenses.Prices.ResetUnits.MONTH',
  YEAR: 'Pages.Licenses.Prices.ResetUnits.YEAR',
} as const satisfies Record<ResetPeriod, string>;
