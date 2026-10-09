import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { addonPricesQueryOptions } from '@/domains/billing';
import { addonQueryOptions } from '../queries';
import {
  canAddPrice,
  countUnvaluedPrices,
  getFlatFees,
  getPeriodSlots,
  getVersionCurrency,
} from '../utils/addon-price.utils';

/**
 * What the pricing of a version reads: the version, the prices the console lists (its
 * flat fees, in the order the API lists them), the slot of each billing period, the
 * currency the version bills in once it has a price, and how many metered prices the
 * console leaves out. Every query is loaded by the route before this renders, so
 * none suspends.
 */
export function useAddonPricing(addonSlug: string) {
  const { data: addon } = useSuspenseQuery(addonQueryOptions(addonSlug));
  const { data: priceList } = useSuspenseQuery(
    addonPricesQueryOptions(addonSlug),
  );
  const prices = useMemo(() => priceList ?? [], [priceList]);
  const flatFees = useMemo(() => getFlatFees(prices), [prices]);

  return {
    addon,
    canAdd: canAddPrice(addon),
    // A version has one currency, fixed by its first price: a deprecated one and a
    // metered one that is not listed count.
    currency: getVersionCurrency(prices),
    flatFees,
    prices,
    slots: useMemo(
      () => getPeriodSlots(prices, addon.pricingType),
      [addon.pricingType, prices],
    ),
    unvaluedCount: countUnvaluedPrices(prices),
  };
}

export type AddonPricing = ReturnType<typeof useAddonPricing>;
