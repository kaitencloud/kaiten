import { describe, expect, it } from 'vite-plus/test';
import type { Model } from '@/api-client';
import { poolGrantOf, summarisePoolPricing } from '../pool-pricing-summary';
import type { RateCardLicense, RateCardRule } from '../rate-card-query';

const rates: Record<string, string | null> = {
  perRequest: null,
  perInputToken: null,
  perCachedInputToken: null,
  perCacheWriteToken: null,
  perOutputToken: null,
  perUnit: null,
  perSecond: null,
};

const rule = (
  id: string,
  modelSlug: string | null,
  values: Partial<typeof rates>,
  entitlementSlug = 'credits',
): RateCardRule =>
  ({
    id,
    licenseSlug: 'pro',
    entitlementSlug,
    modelSlug,
    requestType: modelSlug ? null : 'COMPLETION',
    status: 'ACTIVE',
    grantedByLicense: true,
    grantedByAddons: false,
    createdBy: { id: 'user', name: 'User' },
    updatedBy: { id: 'user', name: 'User' },
    chargeOnError: 'NEVER',
    minimumCreditsPerRequest: '0',
    maximumCreditsPerRequest: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    rates: { ...rates, ...values },
  }) as RateCardRule;

const license = (
  slug: string,
  grant: { value: number; overage: number } | null,
  conversionRules: RateCardRule[],
  lifecycleState: RateCardLicense['lifecycleState'] = 'PUBLISHED',
): RateCardLicense =>
  ({
    id: slug,
    slug,
    name: 'Pro',
    version: '1',
    versionNumber: 1,
    versionName: `Pro ${slug}`,
    lifecycleState,
    isDefault: false,
    family: { currentVersion: null, id: 'family', slug: 'pro' },
    entitlements: grant
      ? [
          {
            entitlementSlug: 'credits',
            entitlementType: 'NUMBER_AI_CREDIT',
            value: { type: 'number', value: grant.value },
            unlimited: false,
            limitCapExceededOveragePercent: grant.overage,
          },
        ]
      : [],
    conversionRules,
  }) as RateCardLicense;

const model = (slug: string, input: string, status: Model['status'] = 'ACTIVE') =>
  ({
    id: slug,
    slug,
    name: slug.toUpperCase(),
    vendor: 'Fixture',
    modality: 'TEXT',
    status,
    vendorCosts: { currency: 'USD', perInputToken: input, perOutputToken: input },
  }) as Model;

const models = [
  model('cheap', '0.000001'),
  model('dear', '0.00001'),
  model('gone', '0.1', 'ARCHIVED'),
];

describe('poolGrantOf', () => {
  it('reads hard limits, overage maximums, unlimited and absent grants', () => {
    expect(poolGrantOf(undefined)).toEqual({ kind: 'NOT_GRANTED' });
    const base = {
      entitlementSlug: 'credits',
      entitlementType: 'NUMBER_AI_CREDIT',
      value: { type: 'number', value: 5000 },
      unlimited: false,
    };
    expect(
      poolGrantOf({ ...base, limitCapExceededOveragePercent: 0 }),
    ).toEqual({ kind: 'HARD_LIMIT', value: 5000 });
    expect(
      poolGrantOf({ ...base, limitCapExceededOveragePercent: 10 }),
    ).toEqual({ kind: 'OVERAGE', value: 5000, percent: 10, maximum: 5500 });
    expect(
      poolGrantOf({ ...base, unlimited: true, limitCapExceededOveragePercent: -1 }),
    ).toEqual({ kind: 'UNLIMITED' });
    // Not floored: 333 credits at 10 % is 366.3, as the API gates and the usage tab shows.
    expect(
      poolGrantOf({ ...base, value: { type: 'number', value: 333 }, limitCapExceededOveragePercent: 10 }),
    ).toEqual({ kind: 'OVERAGE', value: 333, percent: 10, maximum: 366.3 });
  });
});

describe('summarisePoolPricing', () => {
  it('prices every non-archived model through the ladder and ranks cost per credit', () => {
    const [row] = summarisePoolPricing(
      [
        license('pro', { value: 100, overage: 0 }, [
          rule('any', null, { perRequest: '1' }),
        ]),
      ],
      'credits',
      models,
    );
    expect(row.modelsPriced).toBe(2);
    expect(row.wildcards).toEqual(['COMPLETION']);
    expect(row.cheapest?.modelSlug).toBe('cheap');
    expect(row.dearest?.modelSlug).toBe('dear');
    // 1,500 + 500 tokens at $0.000001, charged 1 credit.
    expect(row.cheapest?.costPerCredit).toMatch(/^0\.002/);
    expect(row.noRule).toBe(false);
    expect(row.partialCosts).toBe(0);
  });

  it('leaves a model with a partial vendor cost out of the range, and counts it', () => {
    // No output cost: its cost per credit would look the lowest of all.
    const inputOnly = {
      ...model('partial', '0.0000001'),
      vendorCosts: { currency: 'USD', perInputToken: '0.0000001' },
    } as Model;
    const [row] = summarisePoolPricing(
      [
        license('pro', { value: 100, overage: 0 }, [
          rule('any', null, { perRequest: '1' }),
        ]),
      ],
      'credits',
      [...models, inputOnly],
    );
    expect(row.modelsPriced).toBe(3);
    expect(row.partialCosts).toBe(1);
    expect(row.cheapest?.modelSlug).toBe('cheap');
    expect(row.dearest?.modelSlug).toBe('dear');
  });

  it('flags a granted pool with no rule and rules on a version that does not grant it', () => {
    const rows = summarisePoolPricing(
      [
        license('trial', { value: 100, overage: 0 }, []),
        license('partner', null, [rule('exact', 'cheap', { perRequest: '2' })]),
        license('unrelated', null, [
          rule('other', null, { perRequest: '1' }, 'other-pool'),
        ]),
      ],
      'credits',
      models,
    );
    expect(rows.map((row) => row.licenseSlug)).toEqual(['trial', 'partner']);
    expect(rows[0]).toMatchObject({ noRule: true, modelsPriced: 0, cheapest: null });
    expect(rows[1]).toMatchObject({
      pricedNotGranted: true,
      modelsPriced: 1,
      wildcards: [],
    });
  });

  it('keeps archived versions, marked', () => {
    const [row] = summarisePoolPricing(
      [license('old', { value: 1, overage: 0 }, [], 'ARCHIVED')],
      'credits',
      models,
    );
    expect(row.archived).toBe(true);
  });
});
