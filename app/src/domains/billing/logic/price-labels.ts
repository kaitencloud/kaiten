import type { Price } from '@/api-client';
import type {
  BillingModel,
  BillingPeriod,
  BillingTiming,
  ResetPeriod,
} from './price-types';

// Every label an enum of a price reads under is typed against the contract
// (`satisfies Record<Enum, string>`), since no check reads a key built from a
// value at run time: a value the API adds fails the type check until it reads in
// both languages.

export const BILLING_MODEL_LABEL_KEYS = {
  FLAT_FEE: 'Features.Billing.Price.Models.FLAT_FEE.label',
  USAGE_BASED: 'Features.Billing.Price.Models.USAGE_BASED.label',
  OVERAGE: 'Features.Billing.Price.Models.OVERAGE.label',
} as const satisfies Record<BillingModel, string>;

export const BILLING_MODEL_BLURB_KEYS = {
  FLAT_FEE: 'Features.Billing.Price.Models.FLAT_FEE.blurb',
  USAGE_BASED: 'Features.Billing.Price.Models.USAGE_BASED.blurb',
  OVERAGE: 'Features.Billing.Price.Models.OVERAGE.blurb',
} as const satisfies Record<BillingModel, string>;

export const BILLING_TIMING_LABEL_KEYS = {
  ADVANCE: 'Features.Billing.Price.Timings.ADVANCE.label',
  ARREARS: 'Features.Billing.Price.Timings.ARREARS.label',
} as const satisfies Record<BillingTiming, string>;

export const BILLING_TIMING_BLURB_KEYS = {
  ADVANCE: 'Features.Billing.Price.Timings.ADVANCE.blurb',
  ARREARS: 'Features.Billing.Price.Timings.ARREARS.blurb',
} as const satisfies Record<BillingTiming, string>;

export const BILLING_PERIOD_LABEL_KEYS = {
  MONTHLY: 'Features.Billing.Price.Periods.MONTHLY',
  QUARTERLY: 'Features.Billing.Price.Periods.QUARTERLY',
  SEMI_ANNUAL: 'Features.Billing.Price.Periods.SEMI_ANNUAL',
  ANNUAL: 'Features.Billing.Price.Periods.ANNUAL',
} as const satisfies Record<BillingPeriod, string>;

// What follows an amount: "/month". A key that starts with a slash sticks to the
// amount, any other is separated from it by a space.
export const BILLING_PERIOD_SUFFIX_KEYS = {
  MONTHLY: 'Features.Billing.Price.PeriodSuffix.MONTHLY',
  QUARTERLY: 'Features.Billing.Price.PeriodSuffix.QUARTERLY',
  SEMI_ANNUAL: 'Features.Billing.Price.PeriodSuffix.SEMI_ANNUAL',
  ANNUAL: 'Features.Billing.Price.PeriodSuffix.ANNUAL',
} as const satisfies Record<BillingPeriod, string>;

export const PRICE_STATUS_LABEL_KEYS = {
  ACTIVE: 'Features.Billing.Price.Status.ACTIVE',
  DEPRECATED: 'Features.Billing.Price.Status.DEPRECATED',
} as const satisfies Record<Price['status'], string>;

/** A reset period as it follows "per": "month", "day". */
export const RESET_PERIOD_UNIT_KEYS = {
  HOUR: 'Features.Billing.Price.ResetUnits.HOUR',
  DAY: 'Features.Billing.Price.ResetUnits.DAY',
  WEEK: 'Features.Billing.Price.ResetUnits.WEEK',
  MONTH: 'Features.Billing.Price.ResetUnits.MONTH',
  YEAR: 'Features.Billing.Price.ResetUnits.YEAR',
} as const satisfies Record<ResetPeriod, string>;
