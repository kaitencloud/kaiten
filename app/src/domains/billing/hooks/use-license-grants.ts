import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { type LicenseGrantReading, readLicenseGrant } from '../logic';
import {
  addonLicenseFamiliesQueryOptions,
  licenseVersionGrantsQueryOptions,
} from '../queries';
import { useCanPerform } from './use-can-perform';

/** A license version, by the name that is shown and the slug that is read. */
export type LicenseVersionRef = { name: string; slug: string };

/**
 * The versions that stand for some license families: the one the API resolves for each
 * -- its default version, else its newest published one -- which is what an add-on or a
 * voucher on that family is measured against. `'all'` is every family of the
 * organization, one version each. It is one request however many families are asked
 * for, and a session that may not list the families gets none: there is nothing to
 * compare, and the screen simply carries no warning.
 */
export function useLicenseFamilyHeads(
  familySlugs: readonly string[] | 'all',
  { enabled = true }: { enabled?: boolean } = {},
): LicenseVersionRef[] {
  // Asked on every render: a hook is never behind the answer of another.
  const mayReadFamilies = useCanPerform('licenseFamilies.list');
  const families = useQuery({
    ...addonLicenseFamiliesQueryOptions(),
    enabled: enabled && mayReadFamilies,
  });
  const wanted = familySlugs === 'all' ? null : familySlugs.join('\u0000');

  return useMemo(
    () =>
      (families.data?.items ?? []).flatMap((family) => {
        const head = family.currentVersion;
        const asked =
          wanted === null || wanted.split('\u0000').includes(family.slug);

        return asked && head?.slug
          ? [{ name: head.name, slug: head.slug }]
          : [];
      }),
    [families.data, wanted],
  );
}

/**
 * What each of some license versions grants, by entitlement: the value and the overage
 * allowance a grant that would replace them is compared with. One request per version,
 * each only when the session may read what a license grants; a version that could not
 * be read is left out, since an unread grant is no reason to warn.
 */
export function useLicenseGrants(
  licenses: readonly LicenseVersionRef[],
  { enabled = true }: { enabled?: boolean } = {},
): ReadonlyMap<string, LicenseGrantReading[]> {
  const mayReadGrants = useCanPerform('licenseGrants.list');
  const grantsOfLicenses = useQueries({
    combine: (results) => results.map((result) => result.data?.items),
    queries: licenses.map((license) => ({
      ...licenseVersionGrantsQueryOptions(license.slug),
      enabled: enabled && mayReadGrants,
    })),
  });

  return useMemo(() => {
    const readings = new Map<string, LicenseGrantReading[]>();
    licenses.forEach((license, index) => {
      for (const grant of grantsOfLicenses[index] ?? []) {
        const reading = readLicenseGrant(license.name, grant);
        if (!reading || !grant.entitlementSlug) {
          continue;
        }
        readings.set(grant.entitlementSlug, [
          ...(readings.get(grant.entitlementSlug) ?? []),
          reading,
        ]);
      }
    });

    return readings;
  }, [grantsOfLicenses, licenses]);
}
