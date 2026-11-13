import { useAiAccess, isAiEntitlement } from '@/domains/ai-credits';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { addonPricesQueryOptions, getEntitlementSlug } from '@/domains/billing';
import {
  addonGrantsQueryOptions,
  addonQueryOptions,
  entitlementsQueryOptions,
} from '../queries';
import {
  canAddPrice,
  getFlatFees,
  getPeriodSlots,
  getVersionCurrency,
} from '../utils/addon-price.utils';

/**
 * What the pricing of a version reads: the version, its prices in the order the API
 * lists them (flat fees and metered ones), the flat fees apart for the slot of each
 * billing period, the currency the version bills in once it has a price, and what a
 * metered price is made of: what the version grants and the entitlement catalogue
 * those grants are named and measured from. Every query is loaded by the route before
 * this renders, so none suspends.
 */
export function useAddonPricing(addonSlug: string) {
  const access = useAiAccess();
  const { data: addon } = useSuspenseQuery(addonQueryOptions(addonSlug));
  const { data: priceList } = useSuspenseQuery(
    addonPricesQueryOptions(addonSlug),
  );
  const { data: grantList } = useSuspenseQuery(
    addonGrantsQueryOptions(addonSlug),
  );
  const { data: catalogue } = useSuspenseQuery(entitlementsQueryOptions);
  const prices = useMemo(
    () =>
      (priceList ?? []).filter((price) => {
        const slug = price.metered?.entitlementSlug;
        return (
          access.available ||
          !slug ||
          catalogue?.items.some(
            (item) =>
              getEntitlementSlug(item) === slug && !isAiEntitlement(item.type),
          )
        );
      }),
    [priceList, catalogue, access.available],
  );
  const grants = useMemo(() => grantList ?? [], [grantList]);
  const entitlements = useMemo(
    () =>
      (catalogue?.items ?? []).filter(
        (item) => access.available || !isAiEntitlement(item.type),
      ),
    [catalogue, access.available],
  );
  const flatFees = useMemo(() => getFlatFees(prices), [prices]);
  const entitlementBySlug = useMemo(
    () =>
      new Map(
        entitlements.map((entitlement) => [
          getEntitlementSlug(entitlement),
          entitlement,
        ]),
      ),
    [entitlements],
  );

  return {
    addon,
    canAdd: canAddPrice(addon),
    // A version has one currency, fixed by its first price, whatever it is and
    // whatever becomes of it.
    currency: getVersionCurrency(prices),
    entitlementBySlug,
    entitlements,
    flatFees,
    grants,
    prices,
    slots: useMemo(
      () => getPeriodSlots(prices, addon.pricingType),
      [addon.pricingType, prices],
    ),
  };
}

export type AddonPricing = ReturnType<typeof useAddonPricing>;
