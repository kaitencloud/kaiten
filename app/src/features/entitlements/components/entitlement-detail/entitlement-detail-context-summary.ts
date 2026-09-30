import { isUnlimitedThreshold } from '@/domains/entitlement-usage';
import type {
  BucketKey,
  CustomerAggregate,
  EnrichedUsage,
  EntitlementDetailContextValue,
  LicenseAggregate,
  LinkedLicenseMapping,
} from './entitlement-detail-context.types';
import { getNumberThreshold } from './entitlement-detail-context-helpers';

type BuildEntitlementDetailSummaryOptions = {
  atRiskInstances: EnrichedUsage[];
  customerAggregates: CustomerAggregate[];
  entitlementSlug?: string;
  impactedCustomerIds: string[];
  impactedInstancesCount: number;
  isLoading: boolean;
  isUsageLoading: boolean;
  licenseAggregates: LicenseAggregate[];
  linkedLicenseMappings: LinkedLicenseMapping[];
  saturationBuckets: Record<BucketKey, number>;
  saturationByLicenseType: EntitlementDetailContextValue['saturationByLicenseType'];
  usageRows: EnrichedUsage[];
};

// "At risk" means using some of the allowance: whatever sits at 0%, or reports
// no usage at all, has nothing to rank, and the card shows its empty state.
function rankByRisk<T extends { maxRatio: number | null }>(items: T[]): T[] {
  return items
    .filter((item) => item.maxRatio !== null && item.maxRatio > 0)
    .sort((left, right) => (right.maxRatio ?? 0) - (left.maxRatio ?? 0))
    .slice(0, 5);
}

export function buildEntitlementDetailSummary({
  atRiskInstances,
  customerAggregates,
  entitlementSlug,
  impactedCustomerIds,
  impactedInstancesCount,
  isLoading,
  isUsageLoading,
  licenseAggregates,
  linkedLicenseMappings,
  saturationBuckets,
  saturationByLicenseType,
  usageRows,
}: BuildEntitlementDetailSummaryOptions): Omit<
  EntitlementDetailContextValue,
  'entitlement'
> {
  const nearLimitLicenses = licenseAggregates.filter(
    (license) =>
      license.maxRatio !== null &&
      license.maxRatio >= 0.8 &&
      license.maxRatio <= 1,
  ).length;
  const overLimitLicenses = licenseAggregates.filter(
    (license) => license.maxRatio !== null && license.maxRatio > 1,
  ).length;
  const unlimitedMappings = linkedLicenseMappings.filter(({ mapping }) => {
    // Null means the grant has no numeric value at all, which is not the same
    // as granting an unbounded one.
    const threshold = getNumberThreshold(mapping);

    return threshold !== null && isUnlimitedThreshold(threshold);
  }).length;
  // Saturation is measured against a cap: without one, the gauges could only
  // show zeros, so the tabs read this count before drawing them.
  const limitedMappings = linkedLicenseMappings.filter(({ mapping }) => {
    const threshold = getNumberThreshold(mapping);

    return threshold !== null && !isUnlimitedThreshold(threshold);
  }).length;
  const linkedLicenses = linkedLicenseMappings.length;
  const impactedCustomers = new Set(impactedCustomerIds).size;
  const riskRatioPercent =
    linkedLicenses === 0
      ? 0
      : Math.round(
          ((nearLimitLicenses + overLimitLicenses) / linkedLicenses) * 100,
        );

  return {
    atRiskInstances,
    customerAggregates,
    entitlementSlug,
    isLoading,
    isUsageLoading,
    licenseAggregates,
    linkedLicenseMappings,
    metrics: {
      atRiskInstances: atRiskInstances.length,
      impactedCustomers,
      impactedInstances: impactedInstancesCount,
      limitedMappings,
      linkedLicenses,
      nearLimitLicenses,
      overLimitLicenses,
      riskRatioPercent,
      unlimitedMappings,
    },
    saturationBuckets,
    saturationByLicenseType,
    topRiskCustomers: rankByRisk(customerAggregates),
    topRiskLicenses: rankByRisk(licenseAggregates),
    usageRows,
  };
}
