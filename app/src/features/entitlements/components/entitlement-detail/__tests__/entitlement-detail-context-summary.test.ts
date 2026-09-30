import { describe, expect, it } from 'vite-plus/test';
import { buildEntitlementDetailSummary } from '../entitlement-detail-context-summary';
import type {
  CustomerAggregate,
  LicenseAggregate,
} from '../entitlement-detail-context.types';

type SummaryOptions = Parameters<typeof buildEntitlementDetailSummary>[0];

const customer = (
  customerId: string,
  maxRatio: number | null,
): CustomerAggregate => ({
  customerId,
  customerName: customerId,
  impactedInstances: 1,
  maxRatio,
  mostExposedLicense: 'Beta Tester',
  nearLimitCount: 0,
  overLimitCount: 0,
});

const license = (
  licenseSlug: string,
  maxRatio: number | null,
): LicenseAggregate => ({
  instances: 1,
  licenseName: licenseSlug,
  licenseSlug,
  licenseType: 'PAID',
  maxRatio,
  nearLimitCount: 0,
  overLimitCount: 0,
  threshold: 100,
  totalUsage: 0,
  updatedAt: '2026-09-11T00:00:00.000Z',
  version: '1',
});

function summarize(
  customerAggregates: CustomerAggregate[],
  licenseAggregates: LicenseAggregate[] = [],
) {
  return buildEntitlementDetailSummary({
    atRiskInstances: [],
    customerAggregates,
    impactedCustomerIds: [],
    impactedInstancesCount: 0,
    isLoading: false,
    isUsageLoading: false,
    licenseAggregates,
    linkedLicenseMappings: [],
    saturationBuckets: {} as SummaryOptions['saturationBuckets'],
    saturationByLicenseType: [],
    usageRows: [],
  });
}

describe('buildEntitlementDetailSummary', () => {
  it('ranks only the customers that use some of their allowance, most exposed first', () => {
    const { topRiskCustomers } = summarize([
      customer('idle', 0),
      customer('half', 0.5),
      customer('unknown', null),
      customer('close', 0.9),
    ]);

    expect(topRiskCustomers.map(({ customerId }) => customerId)).toEqual([
      'close',
      'half',
    ]);
  });

  it('leaves the at-risk card empty when nobody uses any of the allowance', () => {
    const { topRiskCustomers, topRiskLicenses } = summarize(
      [customer('a', 0), customer('b', 0)],
      [license('beta', 0), license('gold', null)],
    );

    expect(topRiskCustomers).toEqual([]);
    expect(topRiskLicenses).toEqual([]);
  });

  it('keeps each ranking to five entries', () => {
    const { topRiskLicenses } = summarize(
      [],
      [0.1, 0.7, 0.3, 1.2, 0.5, 0.2, 0.9].map((ratio, index) =>
        license(`license-${index}`, ratio),
      ),
    );

    expect(topRiskLicenses.map(({ maxRatio }) => maxRatio)).toEqual([
      1.2, 0.9, 0.7, 0.5, 0.3,
    ]);
  });
});
