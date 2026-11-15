import { describe, expect, it } from 'vite-plus/test';
import type { RateCardLicense } from '@/domains/ai-credits';
import {
  CURRENT_FAMILIES,
  currentVersionOf,
  familiesOf,
  familyNameOf,
  formatCell,
  parseCell,
  resolveFamily,
  versionsInView,
  wildcardOf,
  withAddonGrants,
} from '../rate-card-model';

const license = (
  slug: string,
  family: string,
  version: number,
  overrides: Partial<RateCardLicense> = {},
): RateCardLicense => ({
  conversionRules: [],
  entitlements: [],
  family: { currentVersion: null, id: `family-${family}`, slug: family },
  id: `license-${slug}`,
  isDefault: false,
  lifecycleState: 'PUBLISHED',
  name: family,
  slug,
  version: String(version),
  versionName: null,
  versionNumber: version,
  ...overrides,
});

/** The family as the API serves it on each of its versions: what it serves now. */
const serving = (
  family: string,
  slug: string,
  versionNumber: number,
  name = family,
) => ({
  currentVersion: { name, slug, versionNumber },
  id: `family-${family}`,
  slug: family,
});
const STARTER = serving('starter', 'starter-v2', 2, 'Starter');
const PRO = serving('pro', 'pro-v2', 2, 'Pro');

const LICENSES = [
  license('starter', 'starter', 1, { family: STARTER, lifecycleState: 'ARCHIVED', name: 'Starter (old)' }),
  license('starter-v2', 'starter', 2, { family: STARTER, isDefault: true, name: 'Starter' }),
  license('starter-v3', 'starter', 3, { family: STARTER, lifecycleState: 'DRAFT', name: 'Starter Next' }),
  license('pro', 'pro', 1, { family: PRO, name: 'Pro' }),
  license('pro-v2', 'pro', 2, { family: PRO, name: 'Pro' }),
];

describe('the versions the rate card shows', () => {
  it('takes the version the API says a family serves', () => {
    expect(currentVersionOf(LICENSES.slice(0, 3))?.slug).toBe('starter-v2');
    expect(currentVersionOf(LICENSES.slice(3))?.slug).toBe('pro-v2');
  });

  it('keeps a column for a family that serves nothing: its highest version not archived', () => {
    expect(
      currentVersionOf([
        license('x', 'x', 1, { lifecycleState: 'ARCHIVED' }),
        license('x-v2', 'x', 2, { lifecycleState: 'DRAFT' }),
        license('x-v3', 'x', 3, { lifecycleState: 'ARCHIVED' }),
      ])?.slug,
    ).toBe('x-v2');
  });

  it('names a family after the version it serves, else after its highest-numbered one', () => {
    expect(familiesOf(LICENSES)).toEqual([
      { slug: 'pro', name: 'Pro' },
      { slug: 'starter', name: 'Starter' },
    ]);
    expect(
      familyNameOf([
        license('x', 'x', 1, { name: 'First' }),
        license('x-v2', 'x', 2, { name: 'Second', lifecycleState: 'DRAFT' }),
      ]),
    ).toBe('Second');
  });

  it('orders the versions of a family by their number, not by their label', () => {
    const versions = [
      license('y-v10', 'y', 10, { version: '2026-b' }),
      license('y-v9', 'y', 9, { version: '2026-c' }),
      license('y', 'y', 1, { version: '2026-z' }),
    ];

    expect(versionsInView(versions, 'pool', 'y').map((v) => v.slug)).toEqual(['y', 'y-v9', 'y-v10']);
  });

  it('knows from the rules that an add-on can grant the pool, and from the read which one', () => {
    const rule = {
      chargeOnError: 'NEVER' as const,
      createdAt: '2026-10-01T00:00:00Z',
      createdBy: { id: 'u', name: 'Grace Hopper' },
      entitlementSlug: 'pool',
      grantedByAddons: true,
      grantedByLicense: false,
      id: 'rule',
      licenseSlug: 'pro-v2',
      maximumCreditsPerRequest: null,
      minimumCreditsPerRequest: '0',
      modelSlug: null,
      rates: { perCacheWriteToken: null, perCachedInputToken: null, perInputToken: null, perOutputToken: null, perRequest: '1', perSecond: null, perUnit: null },
      requestType: null,
      status: 'ACTIVE' as const,
      updatedAt: '2026-10-01T00:00:00Z',
      updatedBy: { id: 'u', name: 'Grace Hopper' },
    };
    const columns = versionsInView(
      [license('pro-v2', 'pro', 2, { conversionRules: [rule], family: PRO }), license('solo', 'solo', 1)],
      'pool',
      CURRENT_FAMILIES,
    );
    expect(columns.map((v) => [v.slug, v.addonGranted])).toEqual([['pro-v2', true], ['solo', false]]);

    // A version with no rule for the pool learns it from the add-on grants read.
    const grant = { addonName: 'Pack' } as never;
    const read = withAddonGrants(
      columns,
      new Map([
        ['pro', { status: 'UNREADABLE', reason: 'BILLING_OFF' } as const],
        ['solo', { status: 'READY', grants: [grant] } as const],
      ]),
    );
    expect(read.map((v) => [v.slug, v.addonGranted, v.addons?.status])).toEqual([
      ['pro-v2', true, 'UNREADABLE'],
      ['solo', true, 'READY'],
    ]);
  });

  it('shows the current version of each family, or every version of one', () => {
    expect(
      versionsInView(LICENSES, 'pool', CURRENT_FAMILIES).map((v) => v.slug),
    ).toEqual(['pro-v2', 'starter-v2']);
    expect(versionsInView(LICENSES, 'pool', 'starter').map((v) => v.slug)).toEqual(
      ['starter', 'starter-v2', 'starter-v3'],
    );
  });

  it('opens the family of a deep-linked version that is not the current one', () => {
    expect(resolveFamily(LICENSES, undefined, 'starter-v3')).toBe('starter');
    expect(resolveFamily(LICENSES, undefined, 'starter-v2')).toBe(
      CURRENT_FAMILIES,
    );
    expect(resolveFamily(LICENSES, 'pro', 'starter-v3')).toBe('pro');
    expect(resolveFamily(LICENSES, 'gone', undefined)).toBe(CURRENT_FAMILIES);
  });

  it('flags a version that grants the pool and has no rule for it', () => {
    const grant = {
      entitlementSlug: 'pool',
      entitlementType: 'NUMBER_AI_CREDIT',
      limitCapExceededOveragePercent: 0,
      unlimited: false,
      value: { type: 'number', value: 100 },
    };
    const [version] = versionsInView(
      [license('trial', 'trial', 1, { entitlements: [grant] })],
      'pool',
      CURRENT_FAMILIES,
    );
    expect(version).toMatchObject({
      flagged: true,
      grant: { granted: true, amount: 100, unlimited: false },
    });
  });

  it('reads an overage of -1 % as unlimited, as the pool’s Pricing tab does', () => {
    const grant = {
      entitlementSlug: 'pool',
      entitlementType: 'NUMBER_AI_CREDIT',
      limitCapExceededOveragePercent: -1,
      unlimited: false,
      value: { type: 'number', value: 100 },
    };
    const [version] = versionsInView(
      [license('trial', 'trial', 1, { entitlements: [grant] })],
      'pool',
      CURRENT_FAMILIES,
    );
    expect(version.grant).toEqual({ granted: true, amount: 100, unlimited: true });
  });
});

describe('the cell the URL names', () => {
  it('reads a model cell and the wildcard cell, and writes them back', () => {
    expect(parseCell('starter-v2~gpt-5')).toEqual({
      licenseSlug: 'starter-v2',
      modelSlug: 'gpt-5',
    });
    expect(parseCell('starter-v2~*')).toEqual({
      licenseSlug: 'starter-v2',
      modelSlug: null,
    });
    expect(parseCell(undefined)).toBeNull();
    expect(formatCell({ licenseSlug: 'a', modelSlug: null })).toBe('a~*');
  });

  it('a model whose slug is `any` has its own cell, not the wildcard row', () => {
    expect(parseCell('starter-v2~any')).toEqual({
      licenseSlug: 'starter-v2',
      modelSlug: 'any',
    });
    expect(formatCell({ licenseSlug: 'a', modelSlug: 'any' })).toBe('a~any');
  });
});

describe('the wildcard of a version', () => {
  const rule = (id: string, requestType: 'COMPLETION' | null) => ({
    chargeOnError: 'NEVER' as const,
    id,
    maximumCreditsPerRequest: null,
    minimumCreditsPerRequest: '0',
    modelSlug: null,
    rates: { perRequest: '1' },
    requestType,
    status: 'ACTIVE' as const,
  });

  it('prefers the wildcard of the request type to the one for any type', () => {
    const rules = [rule('all', null), rule('typed', 'COMPLETION')];
    expect(wildcardOf(rules, 'COMPLETION')?.id).toBe('typed');
    expect(wildcardOf(rules, 'EMBEDDING')?.id).toBe('all');
    expect(wildcardOf([], 'EMBEDDING')).toBeNull();
  });
});
