import { describe, expect, it } from 'vite-plus/test';
import type { Entitlement } from '@/api-client';
import {
  canonicalWeight,
  combineGrants,
  haveSameSources,
  isCombinedEntitlement,
  isEligibleSource,
  isGrantableEntitlement,
  isSameUsageWindow,
  sharedWindow,
} from '../combined-entitlements';

const definition = (overrides: Partial<Entitlement> = {}) =>
  ({
    aggregationMethod: 'SUM',
    type: 'NUMBER',
    usageSource: 'CALCULATED_USAGE',
    ...overrides,
  }) as Entitlement;

describe('isCombinedEntitlement and isGrantableEntitlement', () => {
  it('tell a combined entitlement from every other, which can be granted', () => {
    expect(isCombinedEntitlement({ usageSource: 'COMBINED_USAGE' })).toBe(true);
    expect(isGrantableEntitlement({ usageSource: 'COMBINED_USAGE' })).toBe(
      false,
    );
    expect(isGrantableEntitlement({ usageSource: 'CALCULATED_USAGE' })).toBe(
      true,
    );
  });

  it('read a definition with no usage source, a flag or a configuration, as grantable', () => {
    expect(isCombinedEntitlement({})).toBe(false);
    expect(isGrantableEntitlement({})).toBe(true);
  });
});

describe('isEligibleSource', () => {
  it('accepts a summed or counted NUMBER and NUMBER_AI_CREDIT entitlement', () => {
    expect(isEligibleSource(definition())).toBe(true);
    expect(isEligibleSource(definition({ aggregationMethod: 'COUNT' }))).toBe(
      true,
    );
    expect(
      isEligibleSource(definition({ type: 'NUMBER_AI_CREDIT' })),
    ).toBe(true);
  });

  it.each([
    ['a flag', { type: 'BOOLEAN' }],
    ['a configuration', { type: 'CONFIG' }],
    ['a combined entitlement, no sum of sums', { usageSource: 'COMBINED_USAGE' }],
    ['an average', { aggregationMethod: 'AVERAGE' }],
    ['a minimum', { aggregationMethod: 'MIN' }],
    ['a maximum', { aggregationMethod: 'MAX' }],
    ['a latest value', { aggregationMethod: 'LATEST' }],
  ] as const)('refuses %s', (_name, overrides) => {
    expect(isEligibleSource(definition(overrides))).toBe(false);
  });

  it('keeps to the window the sources already chosen share, lifetime included', () => {
    const monthly = definition({
      resetAnchor: 'CALENDAR',
      resetPeriod: 'MONTH',
    });
    const lifetime = definition();

    expect(isEligibleSource(monthly, [monthly])).toBe(true);
    expect(isEligibleSource(lifetime, [lifetime])).toBe(true);
    expect(isEligibleSource(lifetime, [monthly])).toBe(false);
    expect(isEligibleSource(monthly, [lifetime])).toBe(false);
    expect(
      isEligibleSource(
        definition({ resetAnchor: 'LICENSE_START', resetPeriod: 'MONTH' }),
        [monthly],
      ),
    ).toBe(false);
    expect(
      isEligibleSource(
        definition({ resetAnchor: 'CALENDAR', resetPeriod: 'YEAR' }),
        [monthly],
      ),
    ).toBe(false);
  });
});

describe('sharedWindow', () => {
  it('is the window of the sources, and nothing while there is none', () => {
    expect(sharedWindow([])).toBeUndefined();
    expect(
      sharedWindow([
        definition({ resetAnchor: 'CALENDAR', resetPeriod: 'MONTH' }),
      ]),
    ).toEqual({ resetAnchor: 'CALENDAR', resetPeriod: 'MONTH' });
    // A lifetime counter is a window of its own, not the absence of one.
    expect(sharedWindow([definition()])).toEqual({
      resetAnchor: undefined,
      resetPeriod: undefined,
    });
  });
});

describe('isSameUsageWindow', () => {
  it('compares the period and the anchor, an absent one being the lifetime counter', () => {
    expect(isSameUsageWindow({}, {})).toBe(true);
    expect(
      isSameUsageWindow(
        { resetAnchor: 'CALENDAR', resetPeriod: 'DAY' },
        { resetAnchor: 'CALENDAR', resetPeriod: 'DAY' },
      ),
    ).toBe(true);
    expect(
      isSameUsageWindow({ resetAnchor: 'CALENDAR', resetPeriod: 'DAY' }, {}),
    ).toBe(false);
  });
});

describe('canonicalWeight', () => {
  it.each([
    [undefined, '1'],
    ['', '1'],
    ['  ', '1'],
    ['0.40', '0.4'],
    ['1.0', '1'],
    [' 2.50 ', '2.5'],
    ['0.6', '0.6'],
  ])('writes %s as %s', (weight, canonical) => {
    expect(canonicalWeight(weight)).toBe(canonical);
  });
});

describe('haveSameSources', () => {
  const sources = [
    { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
    { entitlementSlug: 'ai-credits', weight: '0.6' },
  ];

  it('holds for the same entitlements at the same weights, in any order and any spelling', () => {
    expect(
      haveSameSources(sources, [
        { entitlementSlug: 'ai-credits', weight: '0.60' },
        { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
      ]),
    ).toBe(true);
    expect(
      haveSameSources(
        [{ entitlementSlug: 'a' }, { entitlementSlug: 'b', weight: '1.0' }],
        [
          { entitlementSlug: 'a', weight: '1' },
          { entitlementSlug: 'b', weight: '1' },
        ],
      ),
    ).toBe(true);
  });

  it('breaks on another weight, another entitlement or another number of them', () => {
    expect(
      haveSameSources(sources, [
        { entitlementSlug: 'firecrawl-credits', weight: '0.5' },
        { entitlementSlug: 'ai-credits', weight: '0.6' },
      ]),
    ).toBe(false);
    expect(
      haveSameSources(sources, [
        { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
        { entitlementSlug: 'seats', weight: '0.6' },
      ]),
    ).toBe(false);
    expect(haveSameSources(sources, sources.slice(0, 1))).toBe(false);
  });
});

describe('combineGrants', () => {
  const grants = (bySlug: Record<string, number>) => (slug: string) =>
    bySlug[slug];

  // The example of the ADR: 1000 granted on each source, weights 0.4 and 0.6.
  it('sums the weighted grants of the sources, as the API does for the limit', () => {
    expect(
      combineGrants(
        [
          { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
          { entitlementSlug: 'ai-credits', weight: '0.6' },
        ],
        grants({ 'ai-credits': 1000, 'firecrawl-credits': 1000 }),
      ),
    ).toEqual({ limit: '1000', unlimited: false });
  });

  it('is exact: a weight of 0.4 on a grant of 3 is 1.2, not 1.2000000000000002', () => {
    expect(
      combineGrants(
        [
          { entitlementSlug: 'a', weight: '0.4' },
          { entitlementSlug: 'b', weight: '1' },
        ],
        grants({ a: 3, b: 0 }),
      ),
    ).toEqual({ limit: '1.2', unlimited: false });
  });

  it('takes a weight left out as 1, and weights that do not add up to 1 as they are', () => {
    expect(
      combineGrants(
        [{ entitlementSlug: 'a' }, { entitlementSlug: 'b', weight: '2.5' }],
        grants({ a: 100, b: 100 }),
      ),
    ).toEqual({ limit: '350', unlimited: false });
  });

  it('is unlimited as soon as a granted source is', () => {
    expect(
      combineGrants(
        [
          { entitlementSlug: 'a', weight: '0.4' },
          { entitlementSlug: 'b', weight: '0.6' },
        ],
        grants({ a: 1000, b: -1 }),
      ),
    ).toEqual({ limit: '-1', unlimited: true });
    expect(
      combineGrants(
        [{ entitlementSlug: 'a' }, { entitlementSlug: 'b' }],
        grants({ a: -1 }),
      ),
    ).toEqual({ limit: '-1', unlimited: true });
  });

  it('counts only the sources the license grants, and is nothing when it grants none', () => {
    expect(
      combineGrants(
        [
          { entitlementSlug: 'a', weight: '0.4' },
          { entitlementSlug: 'b', weight: '0.6' },
        ],
        grants({ a: 500 }),
      ),
    ).toEqual({ limit: '200', unlimited: false });
    expect(
      combineGrants(
        [{ entitlementSlug: 'a' }, { entitlementSlug: 'b' }],
        () => undefined,
      ),
    ).toBeNull();
    expect(combineGrants([], () => 5)).toBeNull();
  });

  it('keeps a grant of nothing: a source granted 0 is granted', () => {
    expect(
      combineGrants(
        [{ entitlementSlug: 'a' }, { entitlementSlug: 'b' }],
        grants({ a: 0 }),
      ),
    ).toEqual({ limit: '0', unlimited: false });
  });

  it('reads a grant too large for a plain string as the digits it has', () => {
    expect(
      combineGrants([{ entitlementSlug: 'a', weight: '2' }], grants({ a: 1e21 })),
    ).toEqual({ limit: '2000000000000000000000', unlimited: false });
  });
});
