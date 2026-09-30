import type { DashboardCollections } from './dashboard-metrics.collections';
import { getChartFill } from './dashboard-metrics.helpers';

export function buildFeatureFlagsGovernance(
  featureFlags: DashboardCollections['featureFlags'],
) {
  const enabledFlagsCount = featureFlags.filter(
    (featureFlag) => featureFlag.enabled,
  ).length;

  return {
    enabledFlagsCount,
    featureFlagsGovernance: {
      enabledDisabled: [
        {
          count: enabledFlagsCount,
          fill: 'var(--chart-2)',
          stateKey: 'enabled',
        },
        {
          count: featureFlags.length - enabledFlagsCount,
          fill: 'var(--chart-5)',
          stateKey: 'disabled',
        },
      ],
      typeDistribution: Array.from(
        featureFlags.reduce((acc, featureFlag) => {
          const key = String(featureFlag.type).toUpperCase();
          acc.set(key, (acc.get(key) ?? 0) + 1);
          return acc;
        }, new Map<string, number>()),
      ).map(([flagType, count], index) => ({
        count,
        fill: getChartFill(index),
        flagType,
      })),
    },
  };
}

export function buildFlagTargetingComplexity(
  featureFlags: DashboardCollections['featureFlags'],
) {
  const targetingComplexityBuckets = new Map<string, number>([
    ['0', 0],
    ['1', 0],
    ['2', 0],
    ['3', 0],
    ['4+', 0],
  ]);

  for (const featureFlag of featureFlags) {
    const rulesCount = featureFlag.targetings?.length ?? 0;
    const key = rulesCount >= 4 ? '4+' : String(rulesCount);

    targetingComplexityBuckets.set(
      key,
      (targetingComplexityBuckets.get(key) ?? 0) + 1,
    );
  }

  return Array.from(targetingComplexityBuckets.entries()).map(
    ([bucket, count], index) => ({
      bucket,
      count,
      fill: getChartFill(index),
    }),
  );
}
