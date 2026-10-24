import { describe, expect, it } from 'vite-plus/test';
import type { Instance, LicenseEntitlement } from '@/api-client';
import { buildUsageRows, getNumberThreshold } from '../entitlement-detail-context-helpers';

// The runtime API sends NUMBER_AI_CREDIT even though the generated grant enum
// still only lists NUMBER, BOOLEAN and CONFIG. Keep the real response here.
function grant(entitlementType: string, limit = 1000, percent = 0): LicenseEntitlement {
  return {
    entitlementType,
    entitlementSlug: 'credits',
    value: { type: 'number', value: limit },
    limitCapExceededOveragePercent: percent,
  } as LicenseEntitlement;
}

function usageRows(mapping: LicenseEntitlement, value = 0.99) {
  return buildUsageRows({
    customerNameById: new Map([['customer', 'Customer']]),
    entitlementSlug: 'credits',
    impactedInstancesWithSlug: [{
      slug: 'production', name: 'Production', customerId: 'customer', licenseSlug: 'pro',
    } as Instance & { slug: string }],
    licenseBySlug: new Map(),
    linkedLicenseBySlug: new Map([['pro', mapping]]),
    usageByInstanceSlug: new Map([['production', [{
      entitlementId: 'credits', entitlementSlug: 'credits', licenseId: 'license',
      licenseSlug: 'pro', source: 'license', value: { type: 'number', value },
      currentPeriodStart: '2026-10-01T00:00:00Z', currentPeriodEnd: '2026-11-01T00:00:00Z',
    }]]]),
  });
}

describe('numeric-family entitlement usage', () => {
  it.each(['NUMBER', 'NUMBER_AI_CREDIT'])(
    'reads the real %s grant cap, usage and period instead of calling it unbounded',
    (entitlementType) => {
      const mapping = grant(entitlementType);
      expect(getNumberThreshold(mapping)).toBe(1000);
      expect(usageRows(mapping)[0]).toMatchObject({
        threshold: 1000, value: 0.99, ratio: 0.00099, status: 'HEALTHY',
        limitCapExceededOveragePercent: 0,
        currentPeriodStart: '2026-10-01T00:00:00Z', currentPeriodEnd: '2026-11-01T00:00:00Z',
      });
    },
  );

  it.each(['BOOLEAN', 'CONFIG'])(
    'does not treat a %s grant as numeric even with a malformed numeric value',
    (entitlementType) => expect(getNumberThreshold(grant(entitlementType))).toBeNull(),
  );

  it('rejects non-numeric values on numeric-family grants', () => {
    expect(getNumberThreshold({ ...grant('NUMBER_AI_CREDIT'), value: { type: 'boolean', value: true } })).toBeNull();
  });

  it('preserves zero, unlimited and soft-limit semantics for AI credit grants', () => {
    expect(getNumberThreshold(grant('NUMBER_AI_CREDIT', 0))).toBe(0);
    expect(usageRows(grant('NUMBER_AI_CREDIT', 0), 0)[0].status).toBe('AT_LIMIT');
    expect(usageRows(grant('NUMBER_AI_CREDIT', -1), 4)[0]).toMatchObject({ threshold: -1, ratio: null, status: 'UNBOUNDED' });
    expect(usageRows(grant('NUMBER_AI_CREDIT', 1000, 20), 1100)[0]).toMatchObject({ threshold: 1000, status: 'IN_ALLOWANCE', limitCapExceededOveragePercent: 20 });
    expect(usageRows(grant('NUMBER_AI_CREDIT', 1000, 20), 1201)[0].status).toBe('OVER_LIMIT');
  });
});
