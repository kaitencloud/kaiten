import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type {
  Entitlement,
  Instance,
  License,
  LicenseEntitlement,
} from '@/api-client';
import { getEntitlementsUsageMetricsOptions } from '@/api-client/@tanstack/react-query.gen';
import {
  allCustomersOptions,
  allInstancesOptions,
  allLicenseEntitlementsOptions,
  allLicensesOptions,
} from '@/lib/api/all-pages-query-options';
import type { EntitlementDetailContextValue } from './entitlement-detail-context.types';
import {
  buildAtRiskInstances,
  buildCustomerAggregates,
  buildLicenseAggregates,
  buildSaturationBuckets,
  buildSaturationByLicenseType,
} from './entitlement-detail-context-aggregates';
import {
  buildLinkedLicenseMappings,
  buildUsageByInstanceSlug,
  buildUsageRows,
} from './entitlement-detail-context-helpers';
import { buildEntitlementDetailSummary } from './entitlement-detail-context-summary';

function getEntitySlug(entity: { slug?: string | null }) {
  return typeof entity.slug === 'string' && entity.slug.trim().length > 0
    ? entity.slug
    : undefined;
}

function useEntitlementBaseData() {
  const { data: licensesData, isLoading: licensesIsLoading } =
    useQuery(allLicensesOptions());
  const { data: instancesData, isLoading: instancesIsLoading } = useQuery(
    allInstancesOptions(),
  );
  const { data: customersData, isLoading: customersIsLoading } = useQuery(
    allCustomersOptions(),
  );

  const activeInstances = useMemo(
    () => (instancesData?.items ?? []) as Instance[],
    [instancesData],
  );
  const customerNameById = useMemo(
    () =>
      new Map(
        (customersData?.items ?? []).map((customer) => [
          customer.id,
          customer.name,
        ]),
      ),
    [customersData],
  );
  const customerSlugById = useMemo(
    () =>
      new Map(
        (customersData?.items ?? []).flatMap((customer) =>
          typeof customer.slug === 'string'
            ? [[customer.id, customer.slug]]
            : [],
        ),
      ),
    [customersData],
  );
  const licensesWithSlug = useMemo(
    () =>
      ((licensesData?.items ?? []) as License[]).filter(
        (license): license is License & { slug: string } =>
          typeof license.slug === 'string' && license.slug.trim().length > 0,
      ),
    [licensesData],
  );
  const licenseBySlug = useMemo(
    () => new Map(licensesWithSlug.map((license) => [license.slug, license])),
    [licensesWithSlug],
  );

  return {
    activeInstances,
    customerNameById,
    customerSlugById,
    customersIsLoading,
    instancesIsLoading,
    licenseBySlug,
    licensesIsLoading,
    licensesWithSlug,
  };
}

function useLinkedLicensesForEntitlement(
  activeInstances: Instance[],
  entitlementSlug: string | undefined,
  licensesWithSlug: Array<License & { slug: string }>,
) {
  const licenseEntitlementsQueries = useQueries({
    queries: licensesWithSlug.map((license) => ({
      ...allLicenseEntitlementsOptions(license.slug),
      enabled: Boolean(entitlementSlug),
      staleTime: 60_000,
    })),
  });

  const linkedLicenseMappings = useMemo(
    () =>
      buildLinkedLicenseMappings(
        entitlementSlug,
        licenseEntitlementsQueries,
        licensesWithSlug,
      ),
    [entitlementSlug, licenseEntitlementsQueries, licensesWithSlug],
  );
  const linkedLicenseBySlug = useMemo(
    () =>
      new Map(
        linkedLicenseMappings.map(({ license, mapping }) => [
          license.slug,
          mapping,
        ]),
      ),
    [linkedLicenseMappings],
  );
  const impactedInstances = useMemo(
    () =>
      activeInstances.filter((instance) =>
        linkedLicenseBySlug.has(instance.licenseSlug),
      ),
    [activeInstances, linkedLicenseBySlug],
  );
  const impactedInstancesWithSlug = useMemo(
    () =>
      impactedInstances.filter(
        (instance): instance is Instance & { slug: string } =>
          typeof instance.slug === 'string' && instance.slug.trim().length > 0,
      ),
    [impactedInstances],
  );

  return {
    impactedInstances,
    impactedInstancesWithSlug,
    licenseEntitlementsQueries,
    linkedLicenseBySlug,
    linkedLicenseMappings,
  };
}

function useEntitlementUsageRows({
  customerNameById,
  entitlementSlug,
  impactedInstancesWithSlug,
  licenseBySlug,
  linkedLicenseBySlug,
}: {
  customerNameById: Map<string, string>;
  entitlementSlug: string | undefined;
  impactedInstancesWithSlug: Array<Instance & { slug: string }>;
  licenseBySlug: Map<string, License & { slug: string }>;
  linkedLicenseBySlug: Map<string, LicenseEntitlement>;
}) {
  const usageQueries = useQueries({
    queries: impactedInstancesWithSlug.map((instance) => ({
      ...getEntitlementsUsageMetricsOptions({
        path: { instanceSlug: instance.slug },
      }),
      enabled: Boolean(entitlementSlug),
      staleTime: 30_000,
    })),
  });

  const usageByInstanceSlug = useMemo(
    () => buildUsageByInstanceSlug(impactedInstancesWithSlug, usageQueries),
    [impactedInstancesWithSlug, usageQueries],
  );
  const usageRows = useMemo(
    () =>
      buildUsageRows({
        customerNameById,
        entitlementSlug,
        impactedInstancesWithSlug,
        licenseBySlug,
        linkedLicenseBySlug,
        usageByInstanceSlug,
      }),
    [
      customerNameById,
      entitlementSlug,
      impactedInstancesWithSlug,
      licenseBySlug,
      linkedLicenseBySlug,
      usageByInstanceSlug,
    ],
  );

  return {
    usageQueries,
    usageRows,
  };
}

export function useEntitlementDetailData(
  entitlement: Entitlement,
): Omit<EntitlementDetailContextValue, 'entitlement'> {
  const entitlementSlug = getEntitySlug(entitlement);
  const {
    activeInstances,
    customerNameById,
    customerSlugById,
    customersIsLoading,
    instancesIsLoading,
    licenseBySlug,
    licensesIsLoading,
    licensesWithSlug,
  } = useEntitlementBaseData();
  const {
    impactedInstances,
    impactedInstancesWithSlug,
    licenseEntitlementsQueries,
    linkedLicenseBySlug,
    linkedLicenseMappings,
  } = useLinkedLicensesForEntitlement(
    activeInstances,
    entitlementSlug,
    licensesWithSlug,
  );
  const { usageQueries, usageRows } = useEntitlementUsageRows({
    customerNameById,
    entitlementSlug,
    impactedInstancesWithSlug,
    licenseBySlug,
    linkedLicenseBySlug,
  });
  const licenseAggregates = useMemo(
    () => buildLicenseAggregates(linkedLicenseMappings, usageRows),
    [linkedLicenseMappings, usageRows],
  );
  const customerAggregates = useMemo(
    () => buildCustomerAggregates(usageRows, customerSlugById),
    [customerSlugById, usageRows],
  );
  const saturationBuckets = useMemo(
    () => buildSaturationBuckets(usageRows),
    [usageRows],
  );
  const saturationByLicenseType = useMemo(
    () => buildSaturationByLicenseType(usageRows),
    [usageRows],
  );
  const atRiskInstances = useMemo(
    () => buildAtRiskInstances(usageRows),
    [usageRows],
  );
  const isLoading =
    licensesIsLoading ||
    instancesIsLoading ||
    customersIsLoading ||
    licenseEntitlementsQueries.some((query) => query.isLoading);
  const isUsageLoading =
    isLoading || usageQueries.some((query) => query.isLoading);

  return useMemo(
    () =>
      buildEntitlementDetailSummary({
        atRiskInstances,
        customerAggregates,
        entitlementSlug,
        impactedCustomerIds: impactedInstances.map(
          (instance) => instance.customerId,
        ),
        impactedInstancesCount: impactedInstances.length,
        isLoading,
        isUsageLoading,
        licenseAggregates,
        linkedLicenseMappings,
        saturationBuckets,
        saturationByLicenseType,
        usageRows,
      }),
    [
      atRiskInstances,
      customerAggregates,
      entitlementSlug,
      impactedInstances,
      isLoading,
      isUsageLoading,
      licenseAggregates,
      linkedLicenseMappings,
      saturationBuckets,
      saturationByLicenseType,
      usageRows,
    ],
  );
}
