import { beforeEach, describe, expect, it } from 'vite-plus/test';
import type { NewAddonPrice, Price } from '@/api-client';
import {
  buildAddon,
  buildAddonGrant,
  buildPrice,
} from '../../e2e/app/_support/fixtures';
import {
  AddonCatalogue,
  type EntitlementFacts,
} from '../../e2e/app/_support/model/billing-addon-catalogue';
import { BillingProblem } from '../../e2e/app/_support/model/billing-problem';

// What the mock of the catalogue makes of a metered price on a version of an add-on: the
// rules of a license version's price (api/internal/modules/licenses/prices/rules.go,
// which the add-ons share) and the five refusals that are the add-on's own
// (api/internal/modules/addons/createaddonprice), in the order the API gives them.

const FLOW: EntitlementFacts = {
  aggregationMethod: 'SUM',
  resetPeriod: 'MONTH',
  type: 'NUMBER',
};
const ENTITLEMENTS: Record<string, EntitlementFacts> = {
  analytics: { type: 'BOOLEAN' },
  averaged: { ...FLOW, aggregationMethod: 'AVERAGE' },
  config: { ...FLOW, type: 'CONFIG' },
  credits: { ...FLOW, saleUnitFactor: 1_000, saleUnitSingular: '1k credits' },
  requests: { ...FLOW, aggregationMethod: 'COUNT' },
  seats: { aggregationMethod: 'SUM', type: 'NUMBER' },
  tokens: FLOW,
};

const GRANTED = [
  'analytics',
  'averaged',
  'config',
  'credits',
  'requests',
  'seats',
  'tokens',
];

const version = buildAddon({
  familySlug: 'pack',
  lifecycleState: 'DRAFT',
  name: 'Pack',
  slug: 'pack',
});

const catalogue = (prices: Price[] = []) =>
  new AddonCatalogue({
    entitlements: ENTITLEMENTS,
    grants: {
      pack: GRANTED.map((entitlementSlug) =>
        buildAddonGrant({
          addonSlug: 'pack',
          entitlementSlug,
          entitlementType: ENTITLEMENTS[entitlementSlug]?.type,
          value: ENTITLEMENTS[entitlementSlug]?.type === 'BOOLEAN' ? true : 5,
        }),
      ),
    },
    prices: { pack: prices },
    versions: [version],
  });

const metered = (
  overrides: Partial<NewAddonPrice> = {},
): NewAddonPrice => ({
  billingModel: 'USAGE_BASED',
  currency: 'USD',
  meteredEntitlementSlug: 'tokens',
  unitAmountDecimal: '0.2',
  ...overrides,
});

const refusalOf = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    if (error instanceof BillingProblem) {
      return { code: error.code, status: error.httpStatus };
    }
    throw error;
  }
  throw new Error('The write was not refused');
};

let model: AddonCatalogue;

beforeEach(() => {
  model = catalogue();
});

describe('a metered price on a version of an add-on', () => {
  it('measures a flow the version grants, in arrears, with no period and no default', () => {
    const created = model.createPrice('pack', metered());

    expect(created).toMatchObject({
      billingModel: 'USAGE_BASED',
      billingPeriod: null,
      billingTiming: 'ARREARS',
      isDefault: false,
      metered: { entitlementSlug: 'tokens', saleUnitFactor: '1' },
      status: 'ACTIVE',
      unitAmountDecimal: '0.2',
    });
    expect(model.listPrices('pack')).toHaveLength(1);
  });

  it('captures the sale unit of the entitlement when the price is created', () => {
    const created = model.createPrice(
      'pack',
      metered({ meteredEntitlementSlug: 'credits' }),
    );

    expect(created.metered).toEqual({
      entitlementSlug: 'credits',
      saleUnitFactor: '1000',
      saleUnitSingular: '1k credits',
    });
  });

  it('takes an overage on any flow it grants, since the allowance is the instance’s', () => {
    expect(
      model.createPrice('pack', metered({ billingModel: 'OVERAGE' })).billingModel,
    ).toBe('OVERAGE');
  });

  it('is one price a meter: another active price may not measure the same entitlement, a retired one does not count', () => {
    const first = model.createPrice('pack', metered());

    expect(
      refusalOf(() =>
        model.createPrice('pack', metered({ billingModel: 'OVERAGE' })),
      ),
    ).toEqual({ code: 'CreateAddonPrice.EntitlementAlreadyMetered', status: 422 });

    model.deprecatePrice('pack', first.id);

    expect(
      model.createPrice('pack', metered({ billingModel: 'OVERAGE' })).metered
        ?.entitlementSlug,
    ).toBe('tokens');
    // Another entitlement is free.
    expect(
      model.createPrice('pack', metered({ meteredEntitlementSlug: 'requests' }))
        .metered?.entitlementSlug,
    ).toBe('requests');
  });
});

describe('the refusals of a metered add-on price', () => {
  it.each([
    ['a stock, which never resets', 'seats', 'EntitlementIsStock'],
    ['an entitlement that is averaged', 'averaged', 'UnsupportedAggregation'],
    ['an entitlement that is not a number', 'config', 'UnsupportedEntitlementType'],
  ])('refuses %s', (_title, slug, code) => {
    expect(
      refusalOf(() =>
        model.createPrice('pack', metered({ meteredEntitlementSlug: slug })),
      ),
    ).toEqual({ code: `CreateAddonPrice.${code}`, status: 422 });
  });

  it('refuses an entitlement the version does not grant', () => {
    const bare = new AddonCatalogue({
      entitlements: ENTITLEMENTS,
      versions: [version],
    });

    expect(refusalOf(() => bare.createPrice('pack', metered()))).toEqual({
      code: 'CreateAddonPrice.EntitlementNotGranted',
      status: 422,
    });
  });

  it('refuses an entitlement the organization does not have', () => {
    expect(
      refusalOf(() =>
        model.createPrice('pack', metered({ meteredEntitlementSlug: 'ghost' })),
      ),
    ).toEqual({ code: 'CreateAddonPrice.EntitlementNotFound', status: 404 });
  });

  it('checks the shape of the price before anything else is read', () => {
    expect(
      refusalOf(() =>
        model.createPrice('pack', metered({ billingTiming: 'ADVANCE' })),
      ).code,
    ).toBe('CreateAddonPrice.InvalidTiming');
    expect(
      refusalOf(() =>
        model.createPrice('pack', metered({ billingPeriod: 'MONTHLY' })),
      ).code,
    ).toBe('CreateAddonPrice.InvalidPeriod');
    expect(
      refusalOf(() => model.createPrice('pack', metered({ isDefault: true })))
        .code,
    ).toBe('CreateAddonPrice.InvalidDefault');
    expect(
      refusalOf(() =>
        model.createPrice('pack', metered({ meteredEntitlementSlug: undefined })),
      ).code,
    ).toBe('CreateAddonPrice.EntitlementNotGranted');
    expect(
      refusalOf(() =>
        model.createPrice('pack', {
          billingModel: 'FLAT_FEE',
          billingPeriod: 'MONTHLY',
          currency: 'USD',
          meteredEntitlementSlug: 'tokens',
          unitAmountDecimal: '100',
        }),
      ).code,
    ).toBe('CreateAddonPrice.InvalidPeriod');
  });

  it('writes nothing when it refuses, and keeps one currency a version', () => {
    const priced = catalogue([
      buildPrice({
        billingPeriod: 'MONTHLY',
        currency: 'EUR',
        id: 'flat',
        isDefault: true,
        unitAmountDecimal: '1000',
      }),
    ]);

    expect(
      refusalOf(() => priced.createPrice('pack', metered())).code,
    ).toBe('CreateAddonPrice.CurrencyMismatch');
    expect(
      refusalOf(() =>
        priced.createPrice('pack', metered({ meteredEntitlementSlug: 'seats' })),
      ).code,
    ).toBe('CreateAddonPrice.EntitlementIsStock');
    expect(priced.listPrices('pack').map(({ id }) => id)).toEqual(['flat']);
    expect(priced.createPrice('pack', metered({ currency: 'EUR' })).currency).toBe(
      'EUR',
    );
  });
});
