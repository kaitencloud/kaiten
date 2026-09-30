import type {
  EntitlementUsage,
  Instance,
  License,
  LicenseEntitlement,
} from '@/api-client';
import {
  getLicenseEntitlementOveragePercent,
  getUsageRatio,
  getUsageStatus,
} from '@/domains/entitlement-usage';
import type {
  BucketKey,
  EnrichedUsage,
  LinkedLicenseMapping,
} from './entitlement-detail-context.types';

type LicenseWithSlug = License & { slug: string };
type InstanceWithSlug = Instance & { slug: string };

export function emptyBuckets(): Record<BucketKey, number> {
  return {
    between50and80: 0,
    between80and100: 0,
    over100: 0,
    unbounded: 0,
    under50: 0,
  };
}

export function getBucketKey(ratio: number | null): BucketKey {
  if (ratio === null) {
    return 'unbounded';
  }
  if (ratio < 0.5) {
    return 'under50';
  }
  if (ratio < 0.8) {
    return 'between50and80';
  }
  if (ratio <= 1) {
    return 'between80and100';
  }
  return 'over100';
}

export function getNumberThreshold(mapping: LicenseEntitlement) {
  if (mapping.entitlementType !== 'NUMBER') {
    return null;
  }

  if (mapping.value?.type !== 'number') {
    return null;
  }

  return mapping.value.value as number;
}

export function buildLinkedLicenseMappings(
  entitlementSlug: string | undefined,
  licenseEntitlementsQueries: Array<{ data?: unknown }>,
  licensesWithSlug: LicenseWithSlug[],
) {
  if (!entitlementSlug) {
    return [] as LinkedLicenseMapping[];
  }

  const mappings: LinkedLicenseMapping[] = [];

  for (const [index, license] of licensesWithSlug.entries()) {
    const page = licenseEntitlementsQueries[index]?.data as
      | { items?: LicenseEntitlement[] }
      | undefined;
    const rows = page?.items ?? [];
    const mapping = rows.find(
      (licenseEntitlement) =>
        licenseEntitlement.entitlementSlug === entitlementSlug,
    );

    if (mapping) {
      mappings.push({ license, mapping });
    }
  }

  return mappings;
}

export function buildUsageByInstanceSlug(
  impactedInstancesWithSlug: InstanceWithSlug[],
  usageQueries: Array<{ data?: unknown }>,
) {
  const usages = new Map<string, EntitlementUsage[]>();

  for (const [index, instance] of impactedInstancesWithSlug.entries()) {
    usages.set(
      instance.slug,
      (usageQueries[index]?.data ?? []) as EntitlementUsage[],
    );
  }

  return usages;
}

type BuildUsageRowsOptions = {
  customerNameById: Map<string, string>;
  entitlementSlug: string | undefined;
  impactedInstancesWithSlug: InstanceWithSlug[];
  licenseBySlug: Map<string, LicenseWithSlug>;
  linkedLicenseBySlug: Map<string, LicenseEntitlement>;
  usageByInstanceSlug: Map<string, EntitlementUsage[]>;
};

export function buildUsageRows({
  customerNameById,
  entitlementSlug,
  impactedInstancesWithSlug,
  licenseBySlug,
  linkedLicenseBySlug,
  usageByInstanceSlug,
}: BuildUsageRowsOptions) {
  if (!entitlementSlug) {
    return [] as EnrichedUsage[];
  }

  return impactedInstancesWithSlug.map((instance) => {
    const mapping = linkedLicenseBySlug.get(instance.licenseSlug);
    const threshold = mapping ? getNumberThreshold(mapping) : null;
    const license = licenseBySlug.get(instance.licenseSlug);
    const usageRowsForInstance = usageByInstanceSlug.get(instance.slug) ?? [];
    const usage = usageRowsForInstance.find(
      (row) => row.entitlementSlug === entitlementSlug,
    );
    const value = usage?.value;
    const numericValue = value?.type === 'number' ? (value.value as number) : 0;
    const limitCapExceededOveragePercent = mapping
      ? getLicenseEntitlementOveragePercent(mapping)
      : null;
    const ratio = getUsageRatio(
      numericValue,
      threshold,
      limitCapExceededOveragePercent,
    );

    return {
      currentPeriodEnd: usage?.currentPeriodEnd,
      currentPeriodStart: usage?.currentPeriodStart,
      limitCapExceededOveragePercent,
      customerId: instance.customerId,
      customerName:
        customerNameById.get(instance.customerId) ?? instance.customerId,
      instanceName: instance.name,
      instanceSlug: instance.slug,
      licenseName: license?.name ?? instance.licenseSlug,
      licenseSlug: instance.licenseSlug,
      licenseType: license?.type ?? 'COMMUNITY',
      ratio,
      status: getUsageStatus(
        numericValue,
        threshold,
        limitCapExceededOveragePercent,
      ),
      threshold,
      value: numericValue,
    };
  });
}
