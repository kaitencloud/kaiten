import { describe, expect, it } from 'vite-plus/test';
import {
  type CatalogPrice,
  getLicensePriceSummary,
  type LicenseWithPrices,
} from '../logic';

const price = (overrides: Partial<CatalogPrice> = {}): CatalogPrice => ({
  billingModel: 'FLAT_FEE',
  billingPeriod: 'MONTHLY',
  billingTiming: 'ADVANCE',
  currency: 'USD',
  displayOrder: 0,
  id: 'price-monthly',
  isDefault: true,
  status: 'ACTIVE',
  unitAmountDecimal: '2900',
  ...overrides,
});

const metered = price({
  billingModel: 'USAGE_BASED',
  billingPeriod: undefined,
  billingTiming: 'ARREARS',
  id: 'price-requests',
  metered: { entitlementSlug: 'requests', saleUnitFactor: '1000' },
  unitAmountDecimal: '0.2',
});

const summaryOf = (
  pricingType: LicenseWithPrices['pricingType'],
  prices: CatalogPrice[] = [],
) => getLicensePriceSummary({ prices, pricingType });

describe('getLicensePriceSummary', () => {
  it('says a free version is free, with no amount', () => {
    expect(summaryOf('FREE')).toEqual({ kind: 'free' });
  });

  it('says a custom version is custom, with no amount, though it has prices', () => {
    expect(summaryOf('CUSTOM', [price()])).toEqual({ kind: 'custom' });
    expect(summaryOf('FREE', [price()])).toEqual({ kind: 'free' });
  });

  it('lists the flat fee of each billing period, shortest period first', () => {
    const annual = price({
      billingPeriod: 'ANNUAL',
      id: 'price-annual',
      unitAmountDecimal: '29000',
    });
    const quarterly = price({
      billingPeriod: 'QUARTERLY',
      id: 'price-quarterly',
      unitAmountDecimal: '8000',
    });

    const summary = summaryOf('PAID', [annual, price(), quarterly]);

    expect(summary).toMatchObject({ kind: 'priced', usage: false });
    expect(
      summary?.kind === 'priced' && summary.flatFees.map(({ id }) => id),
    ).toEqual(['price-monthly', 'price-quarterly', 'price-annual']);
  });

  it('shows the default of a period over another flat fee of it, and the first when none is the default', () => {
    const other = price({ id: 'price-other', isDefault: false });
    const chosen = price({ id: 'price-chosen', isDefault: true });

    expect(
      summaryOf('PAID', [other, chosen]),
    ).toMatchObject({ flatFees: [{ id: 'price-chosen' }] });
    expect(
      summaryOf('PAID', [
        price({ id: 'price-first', isDefault: false }),
        price({ id: 'price-second', isDefault: false }),
      ]),
    ).toMatchObject({ flatFees: [{ id: 'price-first' }] });
  });

  it('says usage is billed on top of a flat fee, and never adds it to the fee', () => {
    expect(summaryOf('PAID', [price(), metered])).toEqual({
      flatFees: [price()],
      kind: 'priced',
      usage: true,
    });
  });

  it('says a version billed on usage alone is, with no flat fee to show', () => {
    expect(summaryOf('PAID', [metered])).toEqual({
      flatFees: [],
      kind: 'priced',
      usage: true,
    });
  });

  it('says a sold version with no active price has none yet', () => {
    expect(summaryOf('PAID')).toEqual({ kind: 'unpriced' });
  });

  it('says nothing of a version sold in a way the console does not know', () => {
    expect(summaryOf(undefined, [price()])).toBeNull();
  });
});
