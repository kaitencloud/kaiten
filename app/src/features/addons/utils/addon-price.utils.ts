import type { Addon, Price } from '@/api-client';
import { BILLING_PERIODS, type BillingPeriod } from '@/domains/billing';

export const isActivePrice = (price: Pick<Price, 'status'>): boolean =>
  price.status === 'ACTIVE';

/**
 * Only a flat fee is valued on an add-on. The API takes a metered price
 * (`USAGE_BASED`, `OVERAGE`) on a version and keeps it, but billing never
 * composes a line from one, so the console lists and offers flat fees only.
 */
export const isFlatFee = (price: Pick<Price, 'billingModel'>): boolean =>
  price.billingModel === 'FLAT_FEE';

/** The prices the console shows: the flat fees, in the order the API lists them. */
export const getFlatFees = (prices: readonly Price[]): Price[] =>
  prices.filter(isFlatFee);

/** How many metered prices the version has that the console does not list. */
export const countUnvaluedPrices = (prices: readonly Price[]): number =>
  prices.filter((price) => !isFlatFee(price)).length;

/**
 * The currency a version bills in. A version has one, fixed by its first price,
 * which stays the version's whatever becomes of that price: a deprecated price, and
 * a metered one the console does not list, still count.
 */
export const getVersionCurrency = (
  prices: readonly Price[],
): string | undefined => prices[0]?.currency;

/**
 * The display order a new price takes: after the last one the version has. A
 * version with no price leaves it to the API, whose default puts the first at 0.
 */
export function getNextDisplayOrder(
  prices: readonly Price[],
): number | undefined {
  return prices.length === 0
    ? undefined
    : Math.max(...prices.map((price) => price.displayOrder)) + 1;
}

/** The price the version bills as the default of one billing period, if it has one. */
export const getDefaultPrice = (
  prices: readonly Price[],
  period: BillingPeriod | undefined,
): Price | undefined =>
  prices.find(
    (price) =>
      isFlatFee(price) &&
      isActivePrice(price) &&
      price.isDefault &&
      price.billingPeriod === period,
  );

/**
 * What the slot of a billing period says: the default price that bills the
 * subscriptions of the period, none when the version has no active price for it, or
 * `noDefault` when it has some and none is the one that bills.
 */
export type PeriodSlot = {
  /** The active flat fees of the period, the default included. */
  count: number;
  period: BillingPeriod;
  price: Price | undefined;
  status: 'default' | 'missing' | 'noDefault';
};

// The periods an add-on is sold for in practice: a person looking at its prices
// sees a slot for each, so that a missing annual price shows before the first
// annual customer meets the refusal.
const USUAL_PERIODS: readonly BillingPeriod[] = ['MONTHLY', 'ANNUAL'];

/**
 * One slot per billing period the version is sold for: the usual ones always, and
 * any other the version has a price for. Of a version's flat fees the default active
 * one whose period is the subscription's is the one billed, and a PAID add-on with
 * no default for the period is refused on a subscription of that period
 * (`AttachInstanceAddon.NoPriceForBillingPeriod`). A free add-on, or one sold on
 * request, needs no price: it has slots only for the periods it has a price for.
 */
export function getPeriodSlots(
  prices: readonly Price[],
  pricingType: Addon['pricingType'],
): PeriodSlot[] {
  const active = getFlatFees(prices).filter(isActivePrice);

  return BILLING_PERIODS.flatMap((period) => {
    const ofPeriod = active.filter((price) => price.billingPeriod === period);
    const expected = pricingType === 'PAID' && USUAL_PERIODS.includes(period);
    if (ofPeriod.length === 0 && !expected) {
      return [];
    }
    const price = ofPeriod.find((candidate) => candidate.isDefault);

    return [
      {
        count: ofPeriod.length,
        period,
        price,
        status: price
          ? ('default' as const)
          : ofPeriod.length > 0
            ? ('noDefault' as const)
            : ('missing' as const),
      },
    ];
  });
}

/**
 * What a version lets be done to its prices, from its lifecycle state. A price is
 * created and deprecated, never edited, so the rules are two: an archived version
 * takes no new price, and the default price of a period cannot be deprecated (it
 * is what bills every instance holding the version).
 */
export const canAddPrice = (addon: Pick<Addon, 'lifecycleState'>): boolean =>
  addon.lifecycleState !== 'ARCHIVED';

export type PriceDeprecation =
  | { allowed: true }
  | { allowed: false; reason: 'default' };

/** Whether an active price may be deprecated: not while it is the default of its period. */
export function getPriceDeprecation(
  price: Pick<Price, 'isDefault' | 'status'>,
): PriceDeprecation | undefined {
  if (!isActivePrice(price)) {
    return undefined;
  }

  return price.isDefault
    ? { allowed: false, reason: 'default' }
    : { allowed: true };
}
