import { describe, expect, it } from 'vite-plus/test';
import {
  type CatalogAddonInput,
  type CatalogLicenseInput,
  toVersionsWithPrices,
} from '../logic/catalog-prices';

type CatalogPriceInput = CatalogLicenseInput['prices'][number];

const price = (id: string, overrides: object = {}): CatalogPriceInput =>
  ({
  billingModel: 'FLAT_FEE',
  billingPeriod: 'MONTHLY',
  billingTiming: 'ADVANCE',
  currency: 'USD',
  displayLabel: null,
  displayOrder: 0,
  id,
  isDefault: true,
  meteredEntitlement: null,
  saleUnitFactor: null,
  status: 'ACTIVE',
  unitAmountDecimal: '2900',
  ...overrides,
  }) as CatalogPriceInput;

const license = (
  overrides: Partial<CatalogLicenseInput> = {},
): CatalogLicenseInput =>
  ({
    id: 'license-pro-2',
    lifecycleState: 'PUBLISHED',
    name: 'Pro',
    prices: [price('price-pro')],
    version: '2',
    ...overrides,
  }) as CatalogLicenseInput;

const addon = (overrides: Partial<CatalogAddonInput> = {}): CatalogAddonInput => ({
  id: 'addon-seats-1',
  lifecycleState: 'PUBLISHED',
  name: 'Extra seats',
  prices: [price('price-seats', { status: 'DEPRECATED' })],
  versionName: 'Version - 1',
  ...overrides,
});

describe('toVersionsWithPrices', () => {
  it('lists the license versions and then the add-on versions, each with the prices it has whatever their status', () => {
    const versions = toVersionsWithPrices({
      addons: [addon()],
      licenses: [license()],
    });

    expect(versions).toEqual([
      expect.objectContaining({
        id: 'license-pro-2',
        kind: 'LICENSE',
        lifecycleState: 'PUBLISHED',
        name: 'Pro',
        version: '2',
      }),
      expect.objectContaining({
        id: 'addon-seats-1',
        kind: 'ADDON',
        lifecycleState: 'PUBLISHED',
        name: 'Extra seats',
        versionName: 'Version - 1',
      }),
    ]);
    expect(versions[0]?.prices.map(({ id, status }) => [id, status])).toEqual([
      ['price-pro', 'ACTIVE'],
    ]);
    // A deprecated price is kept: a subscription may still be billed by it.
    expect(versions[1]?.prices.map(({ id, status }) => [id, status])).toEqual([
      ['price-seats', 'DEPRECATED'],
    ]);
  });

  it('reads a state the console does not know as none, and keeps the version', () => {
    const versions = toVersionsWithPrices({
      addons: [addon({ lifecycleState: 'RETIRED' as never })],
      licenses: [license({ lifecycleState: 'RETIRED' as never })],
    });

    expect(versions.map((version) => version.lifecycleState)).toEqual([
      undefined,
      undefined,
    ]);
    expect(versions).toHaveLength(2);
  });

  it('drops a price it cannot read and keeps the others of the version', () => {
    const [version] = toVersionsWithPrices({
      addons: [],
      licenses: [
        license({
          prices: [
            price('price-odd', { billingModel: 'TIERED' }),
            price('price-ok'),
          ],
        }),
      ],
    });

    expect(version?.prices.map(({ id }) => id)).toEqual(['price-ok']);
  });

  it('keeps the entitlement a metered price measures and the units in a sale unit', () => {
    const [version] = toVersionsWithPrices({
      addons: [],
      licenses: [
        license({
          prices: [
            price('price-tokens', {
              billingModel: 'USAGE_BASED',
              billingPeriod: null,
              billingTiming: 'ARREARS',
              meteredEntitlement: 'tokens',
              saleUnitFactor: '1000',
            }),
          ],
        }),
      ],
    });

    expect(version?.prices[0]?.metered).toEqual({
      entitlementSlug: 'tokens',
      saleUnitFactor: '1000',
      saleUnitPlural: null,
      saleUnitSingular: null,
    });
  });

  it('is empty when there is no version', () => {
    expect(toVersionsWithPrices({ addons: [], licenses: [] })).toEqual([]);
  });
});
