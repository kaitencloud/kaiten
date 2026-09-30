import type { GetDashboardDataQuery } from '@/api-client/graphql/graphql';
import type { DashboardSupplementaryData } from '../queries/use-dashboard-data';
import { resolveDashboardCollections } from './dashboard-metrics.collections';
import { EMPTY_DASHBOARD_METRICS } from './dashboard-metrics.helpers';
import type { DashboardMetrics } from './dashboard-metrics.types';
import {
  buildFeatureFlagsGovernance,
  buildFlagTargetingComplexity,
} from './dashboard-metrics-feature-flag-charts';
import {
  buildInstanceLifecycleTimeline,
  buildLicenseExpirationForecast,
  buildTopCustomersByInstances,
} from './dashboard-metrics-instance-charts';
import { buildEntitlementSaturationHeatmap } from './dashboard-metrics-license-charts';
import { buildReleaseMetrics } from './dashboard-metrics-release-charts';
import { buildTokenSecurityPosture } from './dashboard-metrics-token-charts';

export function buildDashboardMetrics(
  data: GetDashboardDataQuery | undefined,
  supplementaryData: DashboardSupplementaryData | undefined,
): DashboardMetrics {
  if (!data) {
    return EMPTY_DASHBOARD_METRICS;
  }

  const now = new Date();
  const {
    activeGraphQlInstances,
    activeInstances,
    customers,
    featureFlags,
    instances,
    licenses,
    releases,
    serviceAccountsCount,
    supplementaryData: resolvedSupplementaryData,
    tokens,
    zones,
  } = resolveDashboardCollections(data, supplementaryData);
  const usesRestInstances = (supplementaryData?.restInstances?.length ?? 0) > 0;
  const instancesForCustomers = usesRestInstances
    ? activeInstances
    : activeGraphQlInstances;
  const { expiringIn30Days, expiringIn60Days, licenseExpirationForecast } =
    buildLicenseExpirationForecast(activeInstances, now);
  const topCustomersByInstances = buildTopCustomersByInstances(
    activeInstances,
    activeGraphQlInstances,
    customers,
    usesRestInstances,
  );
  const instanceLifecycleTimeline = buildInstanceLifecycleTimeline(
    instancesForCustomers,
  );
  const {
    entitlementSaturationHeatmap,
    nearThresholdUsage,
    nearThresholdUsageCurrentPeriod,
    overThresholdUsage,
  } = buildEntitlementSaturationHeatmap(
    instances,
    licenses,
    resolvedSupplementaryData,
  );
  const { enabledFlagsCount, featureFlagsGovernance } =
    buildFeatureFlagsGovernance(featureFlags);
  const flagTargetingComplexity = buildFlagTargetingComplexity(featureFlags);
  const { releaseCadence, releaseCoverageByZone } = buildReleaseMetrics(
    releases,
    zones,
  );
  const { tokenSecurityPosture, tokensActive, tokensExpiringSoon } =
    buildTokenSecurityPosture(tokens, now);

  return {
    charts: {
      entitlementSaturationHeatmap,
      featureFlagsGovernance,
      flagTargetingComplexity,
      instanceLifecycleTimeline,
      licenseExpirationForecast,
      releaseCadence,
      releaseCoverageByZone,
      tokenSecurityPosture,
      topCustomersByInstances,
    },
    summary: {
      activeInstances: activeInstances.length,
      customers: customers.length,
      expiringIn30Days,
      expiringIn60Days,
      featureFlagsEnabled: enabledFlagsCount,
      featureFlagsTotal: featureFlags.length,
      licenses: licenses.length,
      nearThresholdUsage,
      nearThresholdUsageCurrentPeriod,
      overThresholdUsage,
      releases: releases.length,
      serviceAccounts: serviceAccountsCount,
      tokensActive,
      tokensExpiringSoon,
      tokensTotal: tokens.length,
      zonesTotal: zones.length,
      zonesWithRelease: zones.filter((zone) => Boolean(zone.releaseId)).length,
    },
  };
}
