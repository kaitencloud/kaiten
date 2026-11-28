import { describe, expect, it } from 'vite-plus/test';
import type { Entitlement } from '@/api-client';
import { buildComputedEntitlements } from '../license-computed-entitlements.utils';
import type { EditableLicenseEntitlement } from '../license-entitlements.utils';

// A combined entitlement is granted by no license: it is the weighted sum of the sources a version
// grants, which the API computes for an instance. The version page says what it comes to.

const definition = (overrides: Partial<Entitlement> & { slug: string }) =>
  ({
    id: `entitlement-${overrides.slug}`,
    name: overrides.slug,
    type: 'NUMBER',
    ...overrides,
  }) as Entitlement;

const grant = (
  slug: string,
  threshold: number | null,
  overrides: Partial<EditableLicenseEntitlement> = {},
): EditableLicenseEntitlement => ({
  enabled: null,
  entitlementId: `entitlement-${slug}`,
  entitlementName: slug,
  entitlementType: 'NUMBER',
  limitCapExceededOveragePercent: 0,
  threshold,
  ...overrides,
});

const firecrawl = definition({ name: 'Firecrawl Credits', slug: 'firecrawl-credits' });
const ai = definition({ name: 'AI Credits', slug: 'ai-credits' });
const credits = definition({
  name: 'Credits',
  slug: 'credits',
  sources: [
    { entitlementSlug: 'ai-credits', weight: '0.6' },
    { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
  ],
  usageSource: 'COMBINED_USAGE',
});

describe('buildComputedEntitlements', () => {
  // The example of the ADR: 1,000 granted on each source, at 0.4 and 0.6.
  it('sums the weighted grants of the sources the version grants', () => {
    const [computed] = buildComputedEntitlements(
      [firecrawl, ai, credits],
      [grant('firecrawl-credits', 1000), grant('ai-credits', 1000)],
    );

    expect(computed.entitlement).toBe(credits);
    expect(computed.limit).toEqual({ limit: '1000', unlimited: false });
    expect(computed.parts).toEqual([
      { grant: 1000, name: 'AI Credits', slug: 'ai-credits', weight: '0.6' },
      { grant: 1000, name: 'Firecrawl Credits', slug: 'firecrawl-credits', weight: '0.4' },
    ]);
  });

  it('counts only the sources the version grants', () => {
    const [computed] = buildComputedEntitlements(
      [firecrawl, ai, credits],
      [grant('firecrawl-credits', 500)],
    );

    expect(computed.limit).toEqual({ limit: '200', unlimited: false });
    expect(computed.parts.map(({ slug }) => slug)).toEqual(['firecrawl-credits']);
  });

  it('is unlimited as soon as a granted source is', () => {
    const [computed] = buildComputedEntitlements(
      [firecrawl, ai, credits],
      [grant('firecrawl-credits', 1000), grant('ai-credits', -1)],
    );

    expect(computed.limit).toEqual({ limit: '-1', unlimited: true });
    expect(computed.parts.map(({ grant: amount }) => amount)).toEqual([-1, 1000]);
  });

  it('lists nothing for a version that grants none of the sources, or for an entitlement that is not combined', () => {
    expect(
      buildComputedEntitlements([firecrawl, ai, credits], [grant('seats', 10)]),
    ).toEqual([]);
    expect(
      buildComputedEntitlements([firecrawl, ai], [grant('firecrawl-credits', 10)]),
    ).toEqual([]);
  });

  it('does not read a grant that is not a number as a source', () => {
    expect(
      buildComputedEntitlements(
        [firecrawl, ai, credits],
        [
          grant('firecrawl-credits', null, { enabled: true, entitlementType: 'BOOLEAN' }),
          grant('ai-credits', null),
        ],
      ),
    ).toEqual([]);
  });

  it('lists each combined entitlement, in the order of the catalogue', () => {
    const capacity = definition({
      slug: 'capacity',
      sources: [{ entitlementSlug: 'seats' }, { entitlementSlug: 'firecrawl-credits', weight: '2' }],
      usageSource: 'COMBINED_USAGE',
    });
    const computed = buildComputedEntitlements(
      [firecrawl, ai, credits, definition({ slug: 'seats' }), capacity],
      [grant('firecrawl-credits', 10), grant('ai-credits', 10), grant('seats', 3)],
    );

    expect(computed.map(({ entitlement }) => entitlement.slug)).toEqual(['credits', 'capacity']);
    // A weight left out is 1: 3 seats + 2 x 10.
    expect(computed[1].limit).toEqual({ limit: '23', unlimited: false });
  });
});
