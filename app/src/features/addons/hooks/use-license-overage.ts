import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { LicenseEntitlement } from '@/api-client';
import {
  addonCompatibilityQueryOptions,
  addonLicenseFamiliesQueryOptions,
  useCanPerform,
} from '@/domains/billing';
import { licenseGrantsQueryOptions } from '../queries';
import { readLicenseOveragePercent } from '../utils/addon-grant.utils';

/** The overage allowance a license grants an entitlement, and the license that grants it. */
export type LicenseOverage = { licenseName: string; percent: number };

/**
 * Which overage allowance each compatible license grants, by entitlement. An add-on
 * grant that sets its own percentage replaces the license's on every instance that
 * attaches it, so what the license allows is what the person has to be told they are
 * lowering. A license family is read as the API resolves it -- its default version,
 * else its newest published one -- and what that version grants is read for each
 * family the add-on fits. It is a reading of licenses: a session that may not read
 * them has no allowance to compare, and the grant simply carries no warning.
 */
export function useLicenseOverage(
  addonSlug: string,
): ReadonlyMap<string, LicenseOverage[]> {
  // Both are asked on every render: a hook is never behind the answer of another.
  const mayReadFamilies = useCanPerform('licenseFamilies.list');
  const mayReadGrants = useCanPerform('licenseGrants.list');
  const mayReadLicenses = mayReadFamilies && mayReadGrants;
  const compatibility = useQuery(addonCompatibilityQueryOptions(addonSlug));
  const families = useQuery({
    ...addonLicenseFamiliesQueryOptions(),
    enabled: mayReadLicenses,
  });

  const heads = useMemo(
    () =>
      (compatibility.data?.familySlugs ?? []).flatMap((familySlug) => {
        const head = families.data?.items.find(
          (family) => family.slug === familySlug,
        )?.currentVersion;

        return head?.slug ? [{ name: head.name, slug: head.slug }] : [];
      }),
    [compatibility.data, families.data],
  );
  const grantsOfHeads = useQueries({
    combine: (results) =>
      results.map(
        (result): LicenseEntitlement[] | undefined => result.data?.items,
      ),
    queries: heads.map((head) => ({
      ...licenseGrantsQueryOptions(head.slug),
      enabled: mayReadLicenses,
    })),
  });

  return useMemo(() => {
    const overages = new Map<string, LicenseOverage[]>();
    heads.forEach((head, index) => {
      for (const grant of grantsOfHeads[index] ?? []) {
        const percent = readLicenseOveragePercent(grant);
        if (percent === null || !grant.entitlementSlug) {
          continue;
        }
        overages.set(grant.entitlementSlug, [
          ...(overages.get(grant.entitlementSlug) ?? []),
          { licenseName: head.name, percent },
        ]);
      }
    });

    return overages;
  }, [grantsOfHeads, heads]);
}
