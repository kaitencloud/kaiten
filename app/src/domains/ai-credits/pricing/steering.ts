import type { ConversionRates, VendorCosts } from '@/api-client';

import {
  add,
  divide,
  shift,
  isNegative,
  isPositive,
  multiply,
  ONE,
  parseDecimal,
  round,
  subtract,
  toDecimalString,
  type Decimal,
} from './decimal';
import { RATE_PLACES } from './price-usage';
import type { RateKey } from './types';

/**
 * Steering numbers derived from a priced call and its vendor cost. None is a
 * server fact: they compare models and set prices, they bill nothing.
 */

/** USD per credit carries 12 decimals; a margin 6 (a fraction: 0.25 is 25 %). */
export const COST_PER_CREDIT_PLACES = 12;
export const MARGIN_PLACES = 6;

/** Vendor cost ÷ charged credits; null without a cost or when nothing is charged. */
export function costPerCredit(
  vendorUsd: string | null | undefined,
  chargedCredits: string | null | undefined,
): string | null {
  const vendor = parseDecimal(vendorUsd);
  const charged = parseDecimal(chargedCredits);
  if (vendor === null || charged === null || !isPositive(charged)) {
    return null;
  }
  const value = divide(vendor, charged, COST_PER_CREDIT_PLACES);

  return value === null ? null : toDecimalString(value);
}

/**
 * 1 − (vendor cost ÷ charged credits) ÷ credit value, as a fraction rounded
 * half-up to 6 decimals; null without a cost, a charge or a positive value.
 * Computed in one division so that no intermediate rounding leaks in.
 */
export function margin(input: {
  vendorUsd: string | null | undefined;
  chargedCredits: string | null | undefined;
  creditValue: string | null | undefined;
}): string | null {
  const vendor = parseDecimal(input.vendorUsd);
  const charged = parseDecimal(input.chargedCredits);
  const creditValue = parseDecimal(input.creditValue);
  if (
    vendor === null ||
    charged === null ||
    creditValue === null ||
    !isPositive(charged) ||
    !isPositive(creditValue)
  ) {
    return null;
  }
  const revenue = multiply(charged, creditValue);
  // (revenue − vendor) ÷ revenue, in one rounded division.
  const value = divide(subtract(revenue, vendor), revenue, MARGIN_PLACES);

  return value === null ? null : toDecimalString(value);
}

const RATE_KEYS: readonly RateKey[] = [
  'perRequest',
  'perInputToken',
  'perCachedInputToken',
  'perCacheWriteToken',
  'perOutputToken',
  'perUnit',
  'perSecond',
];

/** A percentage change as a factor: `-15` is `0.85`, `10` is `1.1`. */
export function percentToFactor(percent: string): string | null {
  const value = parseDecimal(percent);
  if (value === null) {
    return null;
  }
  const factor = add(ONE, shift(value, -2));

  return isNegative(factor) ? null : toDecimalString(factor);
}

/**
 * Every rate × factor, rounded half-up to 10 decimals (what a rule accepts).
 * A null rate stays null: scaling never turns an inherited cache rate into an
 * own one. Null for a factor that is not a nonnegative decimal.
 */
export function scaleRates(
  rates: ConversionRates,
  factor: string,
): ConversionRates | null {
  const by = parseDecimal(factor);
  if (by === null || isNegative(by)) {
    return null;
  }
  const scaled: ConversionRates = {};
  for (const key of RATE_KEYS) {
    const rate = parseDecimal(rates[key]);
    scaled[key] =
      rate === null
        ? null
        : toDecimalString(round(multiply(rate, by), RATE_PLACES));
  }

  return scaled;
}

/**
 * Rates that make every dimension cost `targetCostPerCredit` USD per credit:
 * vendor cost ÷ target, rounded to 10 decimals. A missing cost leaves the rate
 * null (a cache rate then inherits the input rate, which is the same ratio).
 * The catalogue has no per-second cost, so `perSecond` is always null. Null for
 * a target that is not a positive decimal.
 */
export function ratesFromVendorCost(
  costs: VendorCosts,
  targetCostPerCredit: string,
): ConversionRates | null {
  const target = parseDecimal(targetCostPerCredit);
  if (target === null || !isPositive(target)) {
    return null;
  }
  const rate = (text: string | undefined): string | null => {
    const value: Decimal | null = parseDecimal(text);
    const result = value === null ? null : divide(value, target, RATE_PLACES);

    return result === null ? null : toDecimalString(result);
  };

  return {
    perRequest: rate(costs.perRequest),
    perInputToken: rate(costs.perInputToken),
    perCachedInputToken: rate(costs.perCachedInputToken),
    perCacheWriteToken: rate(costs.perCacheWriteToken),
    perOutputToken: rate(costs.perOutputToken),
    perUnit: rate(costs.perUnit),
    perSecond: null,
  };
}
