import { describe, expect, it } from 'vite-plus/test';
import {
  type CatalogPriceInput,
  type LicenseWithPricesInput,
  toCatalogPrice,
  toLicenseWithPrices,
  toLicensesWithPrices,
} from '../logic';

const priceInput = (
  overrides: Partial<CatalogPriceInput> = {},
): CatalogPriceInput => ({
  billingModel: 'FLAT_FEE',
  billingPeriod: 'MONTHLY',
  billingTiming: 'ADVANCE',
  currency: 'USD',
  displayLabel: 'Pro, monthly',
  displayOrder: 0,
  id: 'price-pro-monthly',
  isDefault: true,
  meteredEntitlement: null,
  saleUnitFactor: null,
  status: 'ACTIVE',
  unitAmountDecimal: '2900',
  ...overrides,
});

const licenseInput = (
  overrides: Partial<LicenseWithPricesInput> = {},
): LicenseWithPricesInput => ({
  id: 'license-pro-v3',
  lifecycleState: 'PUBLISHED',
  name: 'Pro',
  pricingType: 'PAID',
  prices: [priceInput()],
  slug: 'pro-v3',
  version: '3',
  versionName: null,
  ...overrides,
});

describe('toCatalogPrice', () => {
  it('reads a flat fee as the contract has a price, without the members the document does not carry', () => {
    expect(toCatalogPrice(priceInput())).toEqual({
      billingModel: 'FLAT_FEE',
      billingPeriod: 'MONTHLY',
      billingTiming: 'ADVANCE',
      currency: 'USD',
      displayLabel: 'Pro, monthly',
      displayOrder: 0,
      id: 'price-pro-monthly',
      isDefault: true,
      status: 'ACTIVE',
      unitAmountDecimal: '2900',
    });
  });

  it('keeps what the API sends as null, since the contract has those members null too', () => {
    const price = toCatalogPrice(priceInput({ displayLabel: null }));

    expect(price).not.toBeNull();
    expect(price).toHaveProperty('displayLabel', null);
    expect(price).not.toHaveProperty('metered');
  });

  it('reads a metered price with the entitlement it measures and the units in a sale unit', () => {
    const price = toCatalogPrice(
      priceInput({
        billingModel: 'USAGE_BASED',
        billingPeriod: null,
        billingTiming: 'ARREARS',
        meteredEntitlement: 'requests',
        saleUnitFactor: '1000',
        unitAmountDecimal: '0.2',
      }),
    );

    expect(price).toMatchObject({
      billingModel: 'USAGE_BASED',
      metered: { entitlementSlug: 'requests', saleUnitFactor: '1000' },
      unitAmountDecimal: '0.2',
    });
    expect(price).toHaveProperty('billingPeriod', null);
  });

  it('takes a sale unit of one for a metered price that names none', () => {
    expect(
      toCatalogPrice(
        priceInput({
          billingModel: 'OVERAGE',
          billingTiming: 'ARREARS',
          meteredEntitlement: 'seats',
          saleUnitFactor: null,
        }),
      )?.metered,
    ).toEqual({ entitlementSlug: 'seats', saleUnitFactor: '1' });
  });

  it.each([
    ['model', { billingModel: 'TIERED' }],
    ['timing', { billingTiming: 'WEEKLY' }],
    ['period', { billingPeriod: 'DAILY' }],
    ['status', { status: 'PAUSED' }],
  ])('drops a price whose %s the contract does not have', (_name, overrides) => {
    expect(toCatalogPrice(priceInput(overrides))).toBeNull();
  });
});

describe('toLicenseWithPrices', () => {
  it('reads a license version with its prices in the order the API lists them', () => {
    const license = toLicenseWithPrices(
      licenseInput({
        prices: [
          priceInput({ displayOrder: 0, id: 'price-a' }),
          priceInput({ displayOrder: 1, id: 'price-b' }),
        ],
        versionName: 'Autumn',
      }),
    );

    expect(license).toMatchObject({
      id: 'license-pro-v3',
      lifecycleState: 'PUBLISHED',
      name: 'Pro',
      pricingType: 'PAID',
      slug: 'pro-v3',
      version: '3',
      versionName: 'Autumn',
    });
    expect(license.prices.map((price) => price.id)).toEqual([
      'price-a',
      'price-b',
    ]);
  });

  it('leaves the version name out when the API sends none', () => {
    expect(toLicenseWithPrices(licenseInput()).versionName).toBeUndefined();
  });

  it.each(['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const)(
    'reads the state %s',
    (lifecycleState) => {
      expect(toLicenseWithPrices(licenseInput({ lifecycleState })).lifecycleState).toBe(
        lifecycleState,
      );
    },
  );

  it.each(['FREE', 'PAID', 'CUSTOM'])('reads the pricing type %s', (pricingType) => {
    expect(toLicenseWithPrices(licenseInput({ pricingType })).pricingType).toBe(
      pricingType,
    );
  });

  it('does not take a state or a pricing type the contract does not have for one it does', () => {
    const license = toLicenseWithPrices(
      licenseInput({
        lifecycleState: 'RETIRED' as never,
        pricingType: 'DONATION',
      }),
    );

    expect(license.lifecycleState).toBeUndefined();
    expect(license.pricingType).toBeUndefined();
  });

  it('drops the prices it cannot read and keeps the others', () => {
    const license = toLicenseWithPrices(
      licenseInput({
        prices: [
          priceInput({ billingModel: 'TIERED', id: 'unreadable' }),
          priceInput({ id: 'readable' }),
        ],
      }),
    );

    expect(license.prices.map((price) => price.id)).toEqual(['readable']);
  });
});

describe('toLicensesWithPrices', () => {
  it('maps every version of the pages, in order', () => {
    expect(
      toLicensesWithPrices([
        licenseInput({ id: 'a', slug: 'a' }),
        licenseInput({ id: 'b', slug: 'b', prices: [] }),
      ]).map(({ id, prices }) => [id, prices.length]),
    ).toEqual([
      ['a', 1],
      ['b', 0],
    ]);
  });
});
