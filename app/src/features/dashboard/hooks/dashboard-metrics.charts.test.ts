import { describe, expect, it } from 'vite-plus/test';
import type { FeatureFlag, Instance } from '@/api-client';
import type { DashboardCollections } from './dashboard-metrics.collections';
import {
  buildFeatureFlagsGovernance,
  buildFlagTargetingComplexity,
} from './dashboard-metrics-feature-flag-charts';
import {
  buildLicenseExpirationForecast,
  buildTopCustomersByInstances,
} from './dashboard-metrics-instance-charts';
import { buildReleaseMetrics } from './dashboard-metrics-release-charts';

const instances = [
  {
    createdAt: '2026-01-01T00:00:00Z',
    customerId: 'customer-1',
    endLicenseDate: '2026-06-18T00:00:00Z',
    id: 'instance-1',
    licenseSlug: 'paid',
    name: 'Production',
    slug: 'production',
    startLicenseDate: '2026-01-01T00:00:00Z',
  },
  {
    createdAt: '2026-02-01T00:00:00Z',
    customerId: 'customer-1',
    endLicenseDate: '2026-08-20T00:00:00Z',
    id: 'instance-2',
    licenseSlug: 'paid',
    name: 'Staging',
    slug: 'staging',
    startLicenseDate: '2026-02-01T00:00:00Z',
  },
] as Instance[];

describe('dashboard chart builders', () => {
  it('builds expiration buckets and summary counters', () => {
    const result = buildLicenseExpirationForecast(
      instances,
      new Date('2026-06-11T00:00:00Z'),
    );

    expect(result.expiringIn30Days).toBe(1);
    expect(result.expiringIn60Days).toBe(1);
    expect(result.licenseExpirationForecast[0].count).toBe(1);
    expect(result.licenseExpirationForecast[3].count).toBe(1);
  });

  it('sorts customers by active instance count', () => {
    const result = buildTopCustomersByInstances(
      instances,
      [] as DashboardCollections['activeGraphQlInstances'],
      [
        {
          createdAt: '2026-01-01T00:00:00Z',
          id: 'customer-1',
          name: 'Acme',
          slug: 'acme',
        },
      ],
      true,
    );

    expect(result[0]).toMatchObject({ customer: 'Acme', instances: 2 });
  });

  it('groups feature flags by state, type and targeting complexity', () => {
    const flags = [
      { enabled: true, targetings: [], type: 'BOOLEAN' },
      {
        enabled: false,
        targetings: [{}, {}, {}, {}],
        type: 'STRING',
      },
    ] as unknown as FeatureFlag[];

    expect(buildFeatureFlagsGovernance(flags)).toMatchObject({
      enabledFlagsCount: 1,
      featureFlagsGovernance: {
        enabledDisabled: [{ count: 1 }, { count: 1 }],
      },
    });
    expect(buildFlagTargetingComplexity(flags)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: '0', count: 1 }),
        expect.objectContaining({ bucket: '4+', count: 1 }),
      ]),
    );
  });

  it('builds release cadence and includes unassigned zones', () => {
    const result = buildReleaseMetrics(
      [
        {
          createdAt: '2026-01-10T00:00:00Z',
          id: 'release-1',
          version: 'v1.0.0',
        },
      ] as DashboardCollections['releases'],
      [
        { releaseId: 'release-1' },
        { releaseId: null },
      ] as DashboardCollections['zones'],
    );

    expect(result.releaseCadence).toHaveLength(1);
    expect(result.releaseCoverageByZone).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ release: 'v1.0.0', zones: 1 }),
        expect.objectContaining({ release: '__unassigned__', zones: 1 }),
      ]),
    );
  });
});
