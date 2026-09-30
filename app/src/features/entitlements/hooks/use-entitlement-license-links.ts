import { useQueries, useQuery } from '@tanstack/react-query';
import {
  allLicenseEntitlementsOptions,
  allLicensesOptions,
} from '@/lib/api/all-pages-query-options';

/**
 * How many licenses grant an entitlement. The database refuses to delete an
 * entitlement a license still references, and the list page has no cheaper
 * way to know than asking every license, so the lookup only runs once a
 * delete is about to be confirmed (`enabled`).
 */
export function useEntitlementLicenseLinks(
  entitlementSlug: string | undefined,
  enabled: boolean,
) {
  const isEnabled = enabled && Boolean(entitlementSlug);
  const licensesQuery = useQuery({
    ...allLicensesOptions(),
    enabled: isEnabled,
  });
  const licenseSlugs = (licensesQuery.data?.items ?? []).flatMap((license) =>
    license.slug ? [license.slug] : [],
  );
  const mappingQueries = useQueries({
    queries: licenseSlugs.map((licenseSlug) => ({
      ...allLicenseEntitlementsOptions(licenseSlug),
      enabled: isEnabled,
      staleTime: 60_000,
    })),
  });

  const isPending =
    isEnabled &&
    (licensesQuery.isPending ||
      mappingQueries.some((query) => query.isPending));
  const linkedLicenseCount = mappingQueries.filter((query) =>
    query.data?.items.some(
      (mapping) => mapping.entitlementSlug === entitlementSlug,
    ),
  ).length;

  return { isPending, linkedLicenseCount };
}
