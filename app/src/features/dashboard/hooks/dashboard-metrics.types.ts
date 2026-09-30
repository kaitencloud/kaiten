import type { UsageScope } from '@/domains/entitlement-usage';

export type DashboardMetrics = {
  charts: {
    entitlementSaturationHeatmap: Array<{
      between50And80: number;
      between80And100: number;
      licenseType: string;
      over100: number;
      unbounded: number;
      under50: number;
      usageScope: UsageScope;
    }>;
    featureFlagsGovernance: {
      enabledDisabled: Array<{
        count: number;
        fill: string;
        stateKey: string;
      }>;
      typeDistribution: Array<{
        count: number;
        fill: string;
        flagType: string;
      }>;
    };
    flagTargetingComplexity: Array<{
      bucket: string;
      count: number;
      fill: string;
    }>;
    instanceLifecycleTimeline: Array<{
      created: number;
      ending: number;
      started: number;
      timestamp: number;
    }>;
    licenseExpirationForecast: Array<{
      bucket: string;
      count: number;
      fill: string;
    }>;
    releaseCadence: Array<{
      releases: number;
      timestamp: number;
    }>;
    releaseCoverageByZone: Array<{
      fill: string;
      release: string;
      zones: number;
    }>;
    tokenSecurityPosture: Array<{
      fill: string;
      stateKey: string;
      tokens: number;
    }>;
    topCustomersByInstances: Array<{
      customer: string;
      fill: string;
      instances: number;
    }>;
  };
  summary: {
    activeInstances: number;
    customers: number;
    expiringIn30Days: number;
    expiringIn60Days: number;
    featureFlagsEnabled: number;
    featureFlagsTotal: number;
    licenses: number;
    nearThresholdUsage: number;
    /** Subset of nearThresholdUsage whose counters clear at the next reset. */
    nearThresholdUsageCurrentPeriod: number;
    overThresholdUsage: number;
    releases: number;
    serviceAccounts: number;
    /** Tokens that are not revoked, whatever their expiry. */
    tokensActive: number;
    tokensExpiringSoon: number;
    tokensTotal: number;
    zonesTotal: number;
    zonesWithRelease: number;
  };
};
