import { useSuspenseQuery } from '@tanstack/react-query';
import type {
  Customer,
  DeploymentZone,
  Entitlement,
  EntitlementUsage,
  Instance,
  License,
  LicenseEntitlement,
  Release,
} from '@/api-client';
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';
import {
  allDeploymentZonesOptions,
  allReleasesOptions,
} from '@/lib/api/all-pages-query-options';
import type { ReleaseManagementOverviewRelease } from '@/domains/release-management';
import {
  customerQueryOptions,
  entitlementsCatalogQueryOptions,
  instanceLicenseEntitlementsQueryOptions,
  instanceQueryOptions,
  instanceUsageQueryOptions,
  licenseQueryOptions,
} from './instance-detail-query-options';

export type InstanceDetailData = {
  instance: Instance;
  customer: Customer;
  license: License | null;
  entitlements: Entitlement[];
  entitlementUsages: EntitlementUsage[];
  licenseEntitlements: LicenseEntitlement[];
  deploymentZones: DeploymentZone[];
  overviewReleases: ReleaseManagementOverviewRelease[];
  releases: Release[];
};

const asArray = <T>(value: T[] | null | undefined): T[] =>
  Array.isArray(value) ? value : [];

export const useInstanceDetailData = (
  instanceSlug: string,
): InstanceDetailData => {
  // All queries use auto-generated options directly (no custom queryFn).
  // This ensures cache consistency: the same queryKey always uses the same queryFn.
  const { data: instance } = useSuspenseQuery(
    instanceQueryOptions(instanceSlug),
  );

  const { data: customer } = useSuspenseQuery(
    customerQueryOptions(instance.customerSlug),
  );

  const { data: license } = useSuspenseQuery(
    licenseQueryOptions(instance.licenseSlug),
  );

  // Use instanceSlug (route param) instead of instance.slug! to avoid
  // stale-cache issues during re-renders when navigating between instances.
  const { data: entitlementUsages } = useSuspenseQuery(
    instanceUsageQueryOptions(instanceSlug),
  );

  const { data: licenseEntitlements } = useSuspenseQuery(
    instanceLicenseEntitlementsQueryOptions(instance.licenseSlug),
  );

  const { data: entitlements } = useSuspenseQuery(
    entitlementsCatalogQueryOptions,
  );

  // Same options as the deployment-zones / releases features: identical
  // queryKey + queryFn, so the cache entries are shared.
  const { data: deploymentZonesData } = useSuspenseQuery(
    allDeploymentZonesOptions(),
  );
  const { data: overviewReleasesData } = useSuspenseQuery(
    releaseManagementOverviewQueryOptions,
  );
  const { data: releasesData } = useSuspenseQuery(allReleasesOptions());

  return {
    instance,
    customer,
    license: license ?? null,
    entitlements: asArray(entitlements?.items),
    entitlementUsages: asArray(entitlementUsages),
    licenseEntitlements: asArray(licenseEntitlements?.items),
    deploymentZones: asArray(deploymentZonesData?.items),
    overviewReleases: asArray(overviewReleasesData),
    releases: asArray(releasesData?.items),
  };
};
