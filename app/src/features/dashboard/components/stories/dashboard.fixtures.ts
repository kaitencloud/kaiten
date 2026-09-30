import type { DashboardMetrics } from '../../hooks/use-dashboard-metrics';

export const storyDashboardMetrics = {
  charts: {
    entitlementSaturationHeatmap: [
      {
        between50And80: 3,
        between80And100: 2,
        licenseType: 'PAID',
        over100: 1,
        unbounded: 4,
        under50: 8,
        usageScope: 'LIFETIME',
      },
      {
        between50And80: 2,
        between80And100: 1,
        licenseType: 'PAID',
        over100: 0,
        unbounded: 0,
        under50: 5,
        usageScope: 'PERIODIC',
      },
      {
        between50And80: 1,
        between80And100: 1,
        licenseType: 'TRIAL',
        over100: 0,
        unbounded: 1,
        under50: 6,
        usageScope: 'LIFETIME',
      },
    ],
    featureFlagsGovernance: {
      enabledDisabled: [
        { count: 18, fill: 'var(--success)', stateKey: 'enabled' },
        { count: 4, fill: 'var(--muted-foreground)', stateKey: 'disabled' },
      ],
      typeDistribution: [
        { count: 10, fill: 'var(--chart-1)', flagType: 'boolean' },
        { count: 7, fill: 'var(--chart-2)', flagType: 'string' },
        { count: 3, fill: 'var(--chart-3)', flagType: 'number' },
        { count: 2, fill: 'var(--chart-4)', flagType: 'object' },
      ],
    },
    flagTargetingComplexity: [
      { bucket: '0 rules', count: 6, fill: 'var(--chart-1)' },
      { bucket: '1-2 rules', count: 10, fill: 'var(--chart-2)' },
      { bucket: '3+ rules', count: 5, fill: 'var(--chart-3)' },
    ],
    instanceLifecycleTimeline: [
      { created: 2, ending: 0, started: 1, timestamp: 1_772_496_000_000 },
      { created: 4, ending: 1, started: 3, timestamp: 1_775_088_000_000 },
      { created: 3, ending: 2, started: 4, timestamp: 1_777_766_400_000 },
    ],
    licenseExpirationForecast: [
      { bucket: '0-30d', count: 2, fill: 'var(--destructive)' },
      { bucket: '31-60d', count: 5, fill: 'var(--chart-2)' },
      { bucket: '61-90d', count: 7, fill: 'var(--chart-3)' },
    ],
    releaseCadence: [
      { releases: 1, timestamp: 1_772_496_000_000 },
      { releases: 3, timestamp: 1_775_088_000_000 },
      { releases: 2, timestamp: 1_777_766_400_000 },
    ],
    releaseCoverageByZone: [
      { fill: 'var(--chart-1)', release: 'v1.5.0', zones: 3 },
      { fill: 'var(--chart-2)', release: 'v1.5.0-rc1', zones: 1 },
      { fill: 'var(--chart-3)', release: 'none', zones: 2 },
    ],
    tokenSecurityPosture: [
      { fill: 'var(--success)', stateKey: 'healthy', tokens: 12 },
      { fill: 'var(--chart-2)', stateKey: 'expiringSoon', tokens: 3 },
      { fill: 'var(--destructive)', stateKey: 'expired', tokens: 1 },
    ],
    topCustomersByInstances: [
      { customer: 'Acme Corp', fill: 'var(--chart-1)', instances: 6 },
      { customer: 'Nova Retail', fill: 'var(--chart-2)', instances: 4 },
      { customer: 'Globex', fill: 'var(--chart-3)', instances: 3 },
    ],
  },
  summary: {
    activeInstances: 14,
    customers: 8,
    expiringIn30Days: 2,
    expiringIn60Days: 5,
    featureFlagsEnabled: 18,
    featureFlagsTotal: 22,
    licenses: 16,
    nearThresholdUsage: 4,
    nearThresholdUsageCurrentPeriod: 1,
    overThresholdUsage: 1,
    releases: 9,
    serviceAccounts: 5,
    tokensActive: 13,
    tokensExpiringSoon: 3,
    tokensTotal: 16,
    zonesTotal: 6,
    zonesWithRelease: 4,
  },
} satisfies DashboardMetrics;
