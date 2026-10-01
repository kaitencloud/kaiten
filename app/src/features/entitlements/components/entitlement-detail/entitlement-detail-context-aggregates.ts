import type { License } from '@/api-client';
import { isUsageAtRisk, type UsageStatus } from '@/domains/entitlement-usage';
import type {
  CustomerAggregate,
  EnrichedUsage,
  LicenseAggregate,
  LinkedLicenseMapping,
} from './entitlement-detail-context.types';
import {
  emptyBuckets,
  getBucketKey,
  getNumberThreshold,
} from './entitlement-detail-context-helpers';

// An instance in its allowance has spent what it bought and is closing on the
// wall: the "near" column counts it with the ones near a hard limit.
const countsAsNearLimit = (status: UsageStatus) =>
  status === 'NEAR_LIMIT' || status === 'IN_ALLOWANCE';

// One on the wall takes nothing more: the "over" column counts it with the
// ones past it, red like them.
const countsAsOverLimit = (status: UsageStatus) =>
  status === 'AT_LIMIT' || status === 'OVER_LIMIT';

export function buildLicenseAggregates(
  linkedLicenseMappings: LinkedLicenseMapping[],
  usageRows: EnrichedUsage[],
) {
  const aggregates = new Map<string, LicenseAggregate>();

  for (const { license, mapping } of linkedLicenseMappings) {
    aggregates.set(license.slug, {
      enabled:
        mapping.value?.type === 'boolean'
          ? (mapping.value.value as boolean)
          : undefined,
      instances: 0,
      licenseName: license.name,
      licenseSlug: license.slug,
      licenseType: license.type,
      maxRatio: null,
      nearLimitCount: 0,
      overLimitCount: 0,
      threshold: getNumberThreshold(mapping),
      totalUsage: 0,
      updatedAt: mapping.updatedAt,
      // Optional on the API type (version is server-assigned on create, so
      // the shared write/read schema can't require it structurally), but
      // always populated by the time a license is read back.
      version: license.version ?? '',
    });
  }

  for (const usage of usageRows) {
    const aggregate = aggregates.get(usage.licenseSlug);
    if (!aggregate) {
      continue;
    }

    aggregate.instances += 1;
    aggregate.totalUsage += usage.value;
    if (countsAsNearLimit(usage.status)) {
      aggregate.nearLimitCount += 1;
    }
    if (countsAsOverLimit(usage.status)) {
      aggregate.overLimitCount += 1;
    }
    if (
      usage.ratio !== null &&
      (aggregate.maxRatio === null || usage.ratio > aggregate.maxRatio)
    ) {
      aggregate.maxRatio = usage.ratio;
    }
  }

  return [...aggregates.values()].sort((left, right) =>
    left.licenseName.localeCompare(right.licenseName),
  );
}

export function buildCustomerAggregates(
  usageRows: EnrichedUsage[],
  customerSlugById: Map<string, string> = new Map(),
) {
  const aggregates = new Map<string, CustomerAggregate>();

  for (const usage of usageRows) {
    const current = aggregates.get(usage.customerId);
    if (!current) {
      aggregates.set(usage.customerId, {
        customerId: usage.customerId,
        customerName: usage.customerName,
        customerSlug: customerSlugById.get(usage.customerId),
        impactedInstances: 1,
        maxRatio: usage.ratio,
        mostExposedLicense: usage.licenseName,
        nearLimitCount: countsAsNearLimit(usage.status) ? 1 : 0,
        overLimitCount: countsAsOverLimit(usage.status) ? 1 : 0,
      });
      continue;
    }

    current.impactedInstances += 1;
    if (countsAsNearLimit(usage.status)) {
      current.nearLimitCount += 1;
    }
    if (countsAsOverLimit(usage.status)) {
      current.overLimitCount += 1;
    }
    if (
      usage.ratio !== null &&
      (current.maxRatio === null || usage.ratio > current.maxRatio)
    ) {
      current.maxRatio = usage.ratio;
      current.mostExposedLicense = usage.licenseName;
    }
  }

  return [...aggregates.values()].sort(
    (left, right) =>
      right.overLimitCount - left.overLimitCount ||
      right.nearLimitCount - left.nearLimitCount ||
      right.impactedInstances - left.impactedInstances,
  );
}

export function buildSaturationBuckets(usageRows: EnrichedUsage[]) {
  const buckets = emptyBuckets();

  for (const usage of usageRows) {
    buckets[getBucketKey(usage.ratio)] += 1;
  }

  return buckets;
}

export function buildSaturationByLicenseType(usageRows: EnrichedUsage[]) {
  const bucketsByLicenseType = new Map<
    License['type'],
    ReturnType<typeof emptyBuckets>
  >();

  for (const usage of usageRows) {
    const current =
      bucketsByLicenseType.get(usage.licenseType) ?? emptyBuckets();
    current[getBucketKey(usage.ratio)] += 1;
    bucketsByLicenseType.set(usage.licenseType, current);
  }

  return [...bucketsByLicenseType.entries()]
    .map(([licenseType, buckets]) => ({
      buckets,
      licenseType,
      total: Object.values(buckets).reduce((sum, value) => sum + value, 0),
    }))
    .sort((left, right) => left.licenseType.localeCompare(right.licenseType));
}

export function buildAtRiskInstances(usageRows: EnrichedUsage[]) {
  return usageRows
    .filter((usage) => isUsageAtRisk(usage.status))
    .sort((left, right) => (right.ratio ?? -1) - (left.ratio ?? -1));
}
