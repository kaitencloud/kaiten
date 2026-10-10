import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  addonGrantsQueryOptions,
  addonQueryOptions,
  entitlementsQueryOptions,
} from '../queries';
import { getEntitlementSlug } from '../utils/addon-grant.utils';

/**
 * What the grants of a version read: the version, what it grants, and the entitlement
 * catalogue they are picked from and named after. Every query is loaded by the route
 * before this renders, so none suspends. The entitlements a version does not grant yet
 * are the ones a new grant can be given for: it grants one entitlement once.
 */
export function useAddonGrants(addonSlug: string) {
  const { data: addon } = useSuspenseQuery(addonQueryOptions(addonSlug));
  const { data: grantList } = useSuspenseQuery(
    addonGrantsQueryOptions(addonSlug),
  );
  const { data: catalogue } = useSuspenseQuery(entitlementsQueryOptions);
  const grants = useMemo(() => grantList ?? [], [grantList]);
  const entitlements = useMemo(() => catalogue?.items ?? [], [catalogue]);
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
  const available = useMemo(() => {
    const granted = new Set(grants.map((grant) => grant.entitlementSlug));

    return entitlements.filter(
      (entitlement) => !granted.has(getEntitlementSlug(entitlement)),
    );
  }, [entitlements, grants]);

  return { addon, available, entitlementBySlug, entitlements, grants };
}

export type AddonGrants = ReturnType<typeof useAddonGrants>;
