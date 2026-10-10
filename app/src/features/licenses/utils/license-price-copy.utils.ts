import type { NewLicensePrice, Price } from '@/api-client';
import { getNextDisplayOrder, isActivePrice } from './license-price.utils';

/**
 * What a new version takes from the one it starts from, as far as prices go. The
 * prices a version bills are the active ones: a deprecated price is a retired
 * offer, kept only for what is pinned to it, and a new version has nothing
 * pinned. They are copied in display order, one call each, since the API creates
 * a price at a time; a copy that stops halfway is told apart from a version that
 * has some prices of its own by what each price is, not by how many there are.
 */

/**
 * A copy of prices that stopped. What refused it is its `cause`, which the one
 * who tells the person why reads. Nothing is deleted when a copy fails, and
 * nothing is sent to the version the prices are copied from: what stands is read
 * from the versions, by `getPriceCopyState`.
 */
export class PriceCopyError extends Error {
  constructor(cause: unknown) {
    super(
      cause instanceof Error ? cause.message : 'The copy of prices stopped',
      { cause },
    );
    this.name = 'PriceCopyError';
  }
}

/** What refused a copy of prices that stopped, and any other failure as it is. */
export const getCopyFailure = (error: unknown): unknown =>
  error instanceof PriceCopyError ? error.cause : error;

/** The prices of a version a new version starts with: the active ones, in display order. */
export const getCopiablePrices = (prices: readonly Price[]): Price[] =>
  prices.filter(isActivePrice);

/**
 * The request that creates a copy of `price`, which takes its place after
 * `existing` prices of the new version. A flat fee keeps its flag as the default
 * of its period; a metered price names the entitlement it meters, which the new
 * version must grant. What a version leaves to the API (the label it derives, the
 * first display order) is left out.
 */
export function priceCopyBody(
  price: Price,
  existing: readonly Price[],
): NewLicensePrice {
  const isFlatFee = price.billingModel === 'FLAT_FEE';

  return {
    billingModel: price.billingModel,
    billingPeriod: price.billingPeriod ?? undefined,
    billingTiming: price.billingTiming,
    currency: price.currency,
    displayLabel: price.displayLabel || undefined,
    displayOrder: getNextDisplayOrder(existing),
    isDefault: isFlatFee ? price.isDefault : undefined,
    meteredEntitlementSlug: price.metered?.entitlementSlug,
    unitAmountDecimal: price.unitAmountDecimal,
  };
}

/** Whether `copy` is what copying `original` creates: the same offer, as a price of another version. */
export const isCopyOf = (copy: Price, original: Price): boolean =>
  copy.billingModel === original.billingModel &&
  copy.billingPeriod === original.billingPeriod &&
  copy.billingTiming === original.billingTiming &&
  copy.currency === original.currency &&
  copy.unitAmountDecimal === original.unitAmountDecimal &&
  (copy.displayLabel || undefined) === (original.displayLabel || undefined) &&
  copy.metered?.entitlementSlug === original.metered?.entitlementSlug;

export type PriceCopyState = {
  /** The prices of the source the target already has a copy of. */
  copied: Price[];
  /** The prices of the source still to copy, in display order. */
  pending: Price[];
};

/**
 * Where a copy of prices stands: which prices of the source the target has a
 * copy of, and which are left. Each price of the target answers for one price
 * of the source at most, so a target that was priced by hand in the meantime
 * does not hide what is left to copy.
 */
export function getPriceCopyState(
  source: readonly Price[],
  target: readonly Price[],
): PriceCopyState {
  const unmatched = [...target];
  const copied: Price[] = [];
  const pending: Price[] = [];
  for (const original of getCopiablePrices(source)) {
    const index = unmatched.findIndex((copy) => isCopyOf(copy, original));
    if (index === -1) {
      pending.push(original);
    } else {
      unmatched.splice(index, 1);
      copied.push(original);
    }
  }

  return { copied, pending };
}
