import type { Entitlement, Price } from '@/api-client';

/**
 * The enums of a price as the contract has them, and the lists the forms offer.
 * They are here and not in the licenses feature, which edits prices, because the
 * subscription of an instance (a flat fee) and the prices of an add-on read them
 * too: one vocabulary, in one place.
 */
export type BillingModel = Price['billingModel'];

/** How a flat fee is charged over time (`Price.billingPeriod`). */
export type BillingPeriod = NonNullable<Price['billingPeriod']>;

/** How a price is charged against its period (`Price.billingTiming`). */
export type BillingTiming = Price['billingTiming'];

/** The cadence an entitlement resets on, which a metered price is rated per. */
export type ResetPeriod = NonNullable<Entitlement['resetPeriod']>;

export const BILLING_MODELS = [
  'FLAT_FEE',
  'USAGE_BASED',
  'OVERAGE',
] as const satisfies readonly BillingModel[];

export const BILLING_PERIODS = [
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUAL',
  'ANNUAL',
] as const satisfies readonly BillingPeriod[];

export const BILLING_TIMINGS = [
  'ADVANCE',
  'ARREARS',
] as const satisfies readonly BillingTiming[];
