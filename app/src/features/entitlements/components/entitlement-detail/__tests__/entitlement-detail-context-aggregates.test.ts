import { describe, expect, it } from 'vite-plus/test';
import type { EnrichedUsage } from '../entitlement-detail-context.types';
import {
  buildAtRiskInstances,
  buildCustomerAggregates,
} from '../entitlement-detail-context-aggregates';

const usage = (overrides: Partial<EnrichedUsage>): EnrichedUsage => ({
  customerId: 'customer-acme',
  customerName: 'Acme Corp',
  instanceName: 'Acme Production',
  instanceSlug: 'acme-production',
  licenseName: 'Enterprise',
  licenseSlug: 'enterprise',
  licenseType: 'PAID',
  limitCapExceededOveragePercent: 20,
  ratio: 0.91,
  status: 'IN_ALLOWANCE',
  threshold: 250,
  value: 274,
  ...overrides,
});

describe('buildCustomerAggregates', () => {
  it('counts an instance in its allowance with the near-limit ones', () => {
    const [acme] = buildCustomerAggregates([
      usage({}),
      usage({
        instanceSlug: 'acme-staging',
        ratio: 0.2,
        status: 'HEALTHY',
        value: 60,
      }),
    ]);

    expect(acme?.impactedInstances).toBe(2);
    expect(acme?.nearLimitCount).toBe(1);
    expect(acme?.overLimitCount).toBe(0);
  });
});

describe('buildAtRiskInstances', () => {
  it('lists an instance in its allowance among the ones at risk', () => {
    const rows = [
      usage({ instanceSlug: 'a', ratio: 0.2, status: 'HEALTHY' }),
      usage({ instanceSlug: 'b' }),
      usage({ instanceSlug: 'c', ratio: 1.1, status: 'OVER_LIMIT' }),
      usage({ instanceSlug: 'd', ratio: 0.6, status: 'WATCH' }),
    ];

    expect(buildAtRiskInstances(rows).map((row) => row.instanceSlug)).toEqual([
      'c',
      'b',
    ]);
  });
});
