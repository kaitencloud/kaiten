import type { License, Price } from '@/api-client';
import type { BillingPeriod } from '@/domains/billing';
import { getLicenseLifecycleState } from './license-lifecycle.utils';

export const isActivePrice = (price: Pick<Price, 'status'>) =>
  price.status === 'ACTIVE';

/**
 * The currency a version bills in. A version has one, fixed by its first price,
 * which stays the version's whatever becomes of that price: a deprecated price
 * still counts.
 */
export const getVersionCurrency = (prices: readonly Price[]) =>
  prices[0]?.currency;

/**
 * The display order a new price takes: after the last one the version has. A
 * version with no price leaves it to the API, whose default puts the first at
 * 0. Without it the prices of a version sort by an id nobody chose.
 */
export function getNextDisplayOrder(prices: readonly Price[]) {
  return prices.length === 0
    ? undefined
    : Math.max(...prices.map((price) => price.displayOrder)) + 1;
}

/** The price a version bills as the default of one billing period, if it has one. */
export const getDefaultPrice = (
  prices: readonly Price[],
  period: BillingPeriod | undefined,
) =>
  prices.find(
    (price) =>
      price.isDefault && isActivePrice(price) && price.billingPeriod === period,
  );

/**
 * What a version lets be done to its prices, from its lifecycle state. A draft
 * is being prepared, so its prices are edited. Once it is published they are
 * immutable, and the one change left to an existing price is deprecation; a new
 * price can still be added until a subscription bills the version, which only
 * the API knows, so the console offers it and shows the refusal. An archived
 * version is withdrawn: it takes no new price.
 */
export type PriceRules = {
  canAdd: boolean;
  canEdit: boolean;
  /** Whether the version can still gain a price in the console's eyes. */
  state: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
};

export function getPriceRules(
  license: Pick<License, 'lifecycleState'>,
): PriceRules {
  const state = getLicenseLifecycleState(license);

  return {
    canAdd: state !== 'ARCHIVED',
    canEdit: state === 'DRAFT',
    state,
  };
}

export const canEditPrice = (rules: PriceRules, price: Pick<Price, 'status'>) =>
  rules.canEdit && isActivePrice(price);

export const canDeprecatePrice = (price: Pick<Price, 'status'>) =>
  isActivePrice(price);
