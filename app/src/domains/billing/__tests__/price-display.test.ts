import { describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import {
  buildEntitlement,
  buildPrice,
} from '../../../../e2e/app/_support/fixtures';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';
import {
  getPriceAmountParts,
  getPriceLabel,
  getPriceUnitLabel,
  joinPriceAmount,
} from '../logic';

useBillingTexts();

const t = testI18n.t.bind(testI18n);
const format = (factor: number) => factor.toLocaleString('en');

const traces = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Traces',
  resetPeriod: 'MONTH',
  slug: 'traces',
  unit: { plural: 'traces', singular: 'trace' },
});

describe('the unit a metered price is per', () => {
  it('is the sale unit the price was captured with', () => {
    expect(
      getPriceUnitLabel(
        {
          entitlementSlug: 'requests',
          saleUnitFactor: '1000',
          saleUnitSingular: '1k requests',
        },
        undefined,
        format,
      ),
    ).toBe('1k requests');
  });

  it('is the number of base units a sale unit stands for, named by the entitlement', () => {
    expect(
      getPriceUnitLabel(
        { entitlementSlug: 'traces', saleUnitFactor: '100000' },
        traces,
        format,
      ),
    ).toBe('100,000 traces');
  });

  it('is the base unit alone when a sale unit is one of them', () => {
    expect(
      getPriceUnitLabel(
        { entitlementSlug: 'traces', saleUnitFactor: '1' },
        traces,
        format,
      ),
    ).toBe('trace');
    expect(
      getPriceUnitLabel(
        { entitlementSlug: 'gone', saleUnitFactor: '1' },
        undefined,
        format,
      ),
    ).toBe('gone');
  });
});

describe('the amount of a price', () => {
  it('is written from its decimal string of minor units, over the period of a flat fee', () => {
    const price = buildPrice({
      billingPeriod: 'MONTHLY',
      id: 'p1',
      unitAmountDecimal: '2900',
    });

    expect(getPriceAmountParts(price, undefined, t, 'en-US')).toEqual({
      amount: '$29.00',
      suffix: '/month',
    });
  });

  it('is written per sale unit for a metered price, with every decimal it has', () => {
    const price = buildPrice({
      billingModel: 'USAGE_BASED',
      id: 'p2',
      metered: {
        entitlementSlug: 'traces',
        saleUnitFactor: '1000',
        saleUnitSingular: '1k traces',
      },
      unitAmountDecimal: '0.2',
    });

    expect(getPriceAmountParts(price, traces, t, 'en-US')).toEqual({
      amount: '$0.002',
      suffix: 'per 1k traces',
    });
  });

  it('is joined to its suffix, which sticks to the amount when it starts with a slash', () => {
    expect(joinPriceAmount({ amount: '$29.00', suffix: '/month' })).toBe(
      '$29.00/month',
    );
    expect(joinPriceAmount({ amount: '$0.002', suffix: 'per 1k traces' })).toBe(
      '$0.002 per 1k traces',
    );
    expect(joinPriceAmount({ amount: '$5.00', suffix: '' })).toBe('$5.00');
  });
});

describe('what a price is called', () => {
  it('is its label when it has one', () => {
    const price = buildPrice({
      displayLabel: 'Enterprise, monthly',
      id: 'p1',
      unitAmountDecimal: '2900',
    });

    expect(getPriceLabel(price, undefined, t)).toBe('Enterprise, monthly');
  });

  it('is the entitlement a metered price measures, else the slug of it', () => {
    const price = buildPrice({
      billingModel: 'USAGE_BASED',
      id: 'p2',
      metered: { entitlementSlug: 'traces', saleUnitFactor: '1' },
      unitAmountDecimal: '2',
    });

    expect(getPriceLabel(price, traces, t)).toBe('Traces');
    expect(getPriceLabel(price, undefined, t)).toBe('traces');
  });

  it('is its shape for a flat fee with no label', () => {
    const price = buildPrice({ id: 'p3', unitAmountDecimal: '2900' });

    expect(getPriceLabel(price, undefined, t)).toBe('Flat fee');
  });
});
