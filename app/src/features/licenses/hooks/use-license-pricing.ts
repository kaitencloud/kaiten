import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  entitlementsQueryOptions,
  licenseEntitlementsQueryOptions,
  licensePricesQueryOptions,
  licenseQueryOptions,
} from '../queries';
import { getEntitlementSlug } from '../utils/license-entitlements.utils';
import {
  getPriceRules,
  getVersionCurrency,
} from '../utils/license-price.utils';

/**
 * What the pricing of a version reads: the version, its prices in the order the
 * API lists them, what it grants and the entitlement catalogue they are metered
 * from, with the lookups by slug the screens need. Every query is loaded by the
 * route before this renders, so none suspends.
 */
export function useLicensePricing(licenseSlug: string) {
  const { data: license } = useSuspenseQuery(licenseQueryOptions(licenseSlug));
  const { data: priceList } = useSuspenseQuery(
    licensePricesQueryOptions(licenseSlug),
  );
  const { data: catalogue } = useSuspenseQuery(entitlementsQueryOptions);
  const { data: grantList } = useSuspenseQuery(
    licenseEntitlementsQueryOptions(licenseSlug),
  );
  const prices = useMemo(() => priceList ?? [], [priceList]);
  const entitlements = useMemo(() => catalogue?.items ?? [], [catalogue]);
  const grants = useMemo(() => grantList?.items ?? [], [grantList]);

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
  const grantBySlug = useMemo(
    () =>
      new Map(
        grants.flatMap((grant) =>
          grant.entitlementSlug
            ? [[grant.entitlementSlug, grant] as const]
            : [],
        ),
      ),
    [grants],
  );

  return {
    currency: getVersionCurrency(prices),
    entitlementBySlug,
    entitlements,
    grantBySlug,
    grants,
    license,
    prices,
    rules: getPriceRules(license),
  };
}
