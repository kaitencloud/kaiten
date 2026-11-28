import { describe, expect, it } from 'vite-plus/test';
import type { Entitlement, Instance, License, LicenseEntitlement } from '@/api-client';
import {
  buildCombinedLicenseMappings,
  buildUsageRows,
  getNumberThreshold,
} from '../entitlement-detail-context-helpers';

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

// A combined entitlement is granted by no license: it is linked to the licenses that grant its sources,
// at the weighted sum of what they grant, which the API computes for an instance.
describe('the licenses a combined entitlement is linked to', () => {
  const combined = {
    name: 'Credits',
    slug: 'credits',
    sources: [
      { entitlementSlug: 'ai-credits', weight: '0.6' },
      { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
    ],
    type: 'NUMBER',
    usageSource: 'COMBINED_USAGE',
  } as Entitlement;
  const license = (slug: string) => ({ name: slug, slug, type: 'PAID' }) as License & { slug: string };
  const sourceGrant = (slug: string, value: number, updatedAt = '2026-03-01T09:00:00.000Z') =>
    ({
      entitlementName: slug,
      entitlementSlug: slug,
      entitlementType: 'NUMBER',
      limitCapExceededOveragePercent: 0,
      updatedAt,
      value: { type: 'number', value },
    }) as unknown as LicenseEntitlement;
  const page = (...grants: LicenseEntitlement[]) => ({ data: { items: grants } });

  it('sums what each license grants of the sources, as a hard cap that the pages read like any other grant', () => {
    const [linked] = buildCombinedLicenseMappings(
      combined,
      [page(sourceGrant('firecrawl-credits', 1000), sourceGrant('ai-credits', 1000, '2026-04-01T09:00:00.000Z'))],
      [license('pro')],
    );

    expect(linked.license.slug).toBe('pro');
    expect(linked.mapping).toMatchObject({
      entitlementName: 'Credits',
      entitlementSlug: 'credits',
      entitlementType: 'NUMBER',
      limitCapExceededOveragePercent: 0,
      updatedAt: '2026-04-01T09:00:00.000Z',
      value: { type: 'number', value: 1000 },
    });
    expect(getNumberThreshold(linked.mapping)).toBe(1000);
  });

  it('links only the licenses that grant a source, each at what it grants', () => {
    const linked = buildCombinedLicenseMappings(
      combined,
      [page(sourceGrant('firecrawl-credits', 500)), page(sourceGrant('seats', 5)), page(sourceGrant('ai-credits', 100))],
      [license('starter'), license('free'), license('pro')],
    );

    expect(linked.map(({ license: { slug } }) => slug)).toEqual(['starter', 'pro']);
    expect(linked.map(({ mapping }) => getNumberThreshold(mapping))).toEqual([200, 60]);
  });

  it('is unlimited as soon as a license grants a source unlimited, with no allowance to exceed', () => {
    const [linked] = buildCombinedLicenseMappings(
      combined,
      [page(sourceGrant('firecrawl-credits', 1000), sourceGrant('ai-credits', -1))],
      [license('pro')],
    );

    expect(getNumberThreshold(linked.mapping)).toBe(-1);
    expect(linked.mapping.limitCapExceededOveragePercent).toBe(-1);
  });

  it('links nothing for an entitlement with no source, or while the grants of the licenses are not read', () => {
    expect(
      buildCombinedLicenseMappings({ ...combined, sources: [] }, [page(sourceGrant('ai-credits', 10))], [license('pro')]),
    ).toEqual([]);
    expect(buildCombinedLicenseMappings(combined, [{}], [license('pro')])).toEqual([]);
  });

  it('reads the usage of an instance against what the license grants of the sum', () => {
    const [linked] = buildCombinedLicenseMappings(
      combined,
      [page(sourceGrant('firecrawl-credits', 1000), sourceGrant('ai-credits', 1000))],
      [license('pro')],
    );
    const rows = buildUsageRows({
      customerNameById: new Map([['customer', 'Customer']]),
      entitlementSlug: 'credits',
      impactedInstancesWithSlug: [
        { slug: 'production', name: 'Production', customerId: 'customer', licenseSlug: 'pro' } as Instance & { slug: string },
      ],
      licenseBySlug: new Map(),
      linkedLicenseBySlug: new Map([['pro', linked.mapping]]),
      usageByInstanceSlug: new Map([
        [
          'production',
          [
            {
              entitlementId: 'credits',
              entitlementSlug: 'credits',
              licenseId: 'license',
              licenseSlug: 'pro',
              source: 'license',
              value: { type: 'number', value: 900 },
            },
          ],
        ],
      ]),
    });

    expect(rows[0]).toMatchObject({ ratio: 0.9, status: 'NEAR_LIMIT', threshold: 1000, value: 900 });
  });
});
