import { describe, expect, it } from 'vite-plus/test';
import { buildPrice } from '../../../../../e2e/app/_support/fixtures';
import {
  initialLicensePriceFormValues,
  type LicensePriceFormValues,
  licensePriceFormSchema,
  priceFormValuesToCreateBody,
  priceFormValuesToUpdateBody,
  priceToFormValues,
} from '../license-price.schema';

const flat = (
  overrides: Partial<LicensePriceFormValues> = {},
): LicensePriceFormValues => ({
  ...initialLicensePriceFormValues('USD', false),
  amount: '49.00',
  ...overrides,
});

const metered = (
  overrides: Partial<LicensePriceFormValues> = {},
): LicensePriceFormValues =>
  flat({
    amount: '0.08',
    billingModel: 'USAGE_BASED',
    billingPeriod: undefined,
    billingTiming: 'ARREARS',
    meteredEntitlementSlug: 'traces',
    ...overrides,
  });

const issuesOf = (values: LicensePriceFormValues) => {
  const result = licensePriceFormSchema.safeParse(values);

  return result.success
    ? []
    : result.error.issues.map((issue) => [issue.path.join('.'), issue.message]);
};

describe('the form of a price', () => {
  it('starts as a monthly flat fee in advance, in the currency it is given', () => {
    expect(initialLicensePriceFormValues('EUR', true)).toEqual({
      amount: '',
      billingModel: 'FLAT_FEE',
      billingPeriod: 'MONTHLY',
      billingTiming: 'ADVANCE',
      currency: 'EUR',
      displayLabel: '',
      isDefault: true,
      meteredEntitlementSlug: '',
    });
  });

  it('accepts a flat fee, a usage price and an overage with what each needs', () => {
    expect(issuesOf(flat())).toEqual([]);
    expect(issuesOf(metered())).toEqual([]);
    expect(issuesOf(metered({ billingModel: 'OVERAGE' }))).toEqual([]);
  });

  it('accepts an amount of zero, the base of a pure pay-as-you-go version', () => {
    expect(issuesOf(flat({ amount: '0' }))).toEqual([]);
  });

  it('refuses an amount that is not a non-negative decimal, on the amount', () => {
    for (const amount of ['', 'abc', '-1', '1.2.3', '12 EUR']) {
      expect(issuesOf(flat({ amount }))).toEqual([
        ['amount', 'Pages.Licenses.Prices.Form.Errors.amount'],
      ]);
    }
  });

  it('refuses more decimals than a price may carry', () => {
    // USD has 2, a price may carry 12 more.
    expect(issuesOf(flat({ amount: '0.12345678901234' }))).toEqual([]);
    expect(issuesOf(flat({ amount: '0.123456789012345' }))).toEqual([
      ['amount', 'Pages.Licenses.Prices.Form.Errors.amount'],
    ]);
  });

  it('refuses more digits than the API takes before the point, in minor units', () => {
    // 12 digits of cents is 10 of dollars: what the form accepts the API takes.
    expect(issuesOf(flat({ amount: '9999999999.99' }))).toEqual([]);
    expect(issuesOf(flat({ amount: '10000000000' }))).toEqual([
      ['amount', 'Pages.Licenses.Prices.Form.Errors.amount'],
    ]);
  });

  it('refuses a currency the API has no exponent for', () => {
    expect(issuesOf(flat({ currency: 'XXZ' }))).toEqual([
      ['currency', 'Pages.Licenses.Prices.Form.Errors.currency'],
    ]);
  });

  it('refuses a label longer than the API takes', () => {
    expect(issuesOf(flat({ displayLabel: 'x'.repeat(200) }))).toEqual([]);
    expect(issuesOf(flat({ displayLabel: 'x'.repeat(201) }))).toEqual([
      ['displayLabel', 'Pages.Licenses.Prices.Form.Errors.label'],
    ]);
  });

  it('asks a metered price for its entitlement, and a flat fee for its period', () => {
    expect(issuesOf(metered({ meteredEntitlementSlug: '' }))).toEqual([
      ['meteredEntitlementSlug', 'Pages.Licenses.Prices.Form.Errors.meter'],
    ]);
    expect(issuesOf(flat({ billingPeriod: undefined }))).toEqual([
      ['billingPeriod', 'Pages.Licenses.Prices.Form.Errors.period'],
    ]);
  });
});

describe('the body of a new price', () => {
  it('sends a flat fee as the API takes it: the amount in minor units, never as typed', () => {
    expect(
      priceFormValuesToCreateBody(
        flat({ displayLabel: 'Pro monthly', isDefault: true }),
        undefined,
      ),
    ).toEqual({
      billingModel: 'FLAT_FEE',
      billingPeriod: 'MONTHLY',
      billingTiming: 'ADVANCE',
      currency: 'USD',
      displayLabel: 'Pro monthly',
      displayOrder: undefined,
      isDefault: true,
      meteredEntitlementSlug: undefined,
      unitAmountDecimal: '4900',
    });
  });

  it('keeps every decimal of a price per unit, and reads a comma as a point', () => {
    expect(
      priceFormValuesToCreateBody(metered({ amount: '0,075' }), 2)
        .unitAmountDecimal,
    ).toBe('7.5');
    expect(
      priceFormValuesToCreateBody(metered({ amount: '0.00002' }), 2)
        .unitAmountDecimal,
    ).toBe('0.002');
  });

  it('respects the exponent of the currency', () => {
    expect(
      priceFormValuesToCreateBody(
        flat({ amount: '5000', currency: 'JPY' }),
        undefined,
      ).unitAmountDecimal,
    ).toBe('5000');
    expect(
      priceFormValuesToCreateBody(
        flat({ amount: '1.5', currency: 'KWD' }),
        undefined,
      ).unitAmountDecimal,
    ).toBe('1500');
  });

  it('sends a metered price in arrears, with no period and no default, whatever the form kept', () => {
    const body = priceFormValuesToCreateBody(
      metered({
        billingPeriod: 'ANNUAL',
        billingTiming: 'ADVANCE',
        isDefault: true,
      }),
      3,
    );

    expect(body).toMatchObject({
      billingModel: 'USAGE_BASED',
      billingPeriod: undefined,
      billingTiming: 'ARREARS',
      displayOrder: 3,
      isDefault: undefined,
      meteredEntitlementSlug: 'traces',
    });
  });

  it('sends a flat fee without the entitlement the form may have kept', () => {
    expect(
      priceFormValuesToCreateBody(
        flat({ meteredEntitlementSlug: 'traces' }),
        undefined,
      ).meteredEntitlementSlug,
    ).toBeUndefined();
  });

  it('leaves an empty label to the API, which derives one', () => {
    expect(
      priceFormValuesToCreateBody(flat({ displayLabel: '  ' }), undefined)
        .displayLabel,
    ).toBeUndefined();
  });
});

describe('the changes an edit sends', () => {
  it('never carries the model, the currency or the order', () => {
    const body = priceFormValuesToUpdateBody(flat({ displayLabel: 'Pro' }));

    expect(Object.keys(body).sort()).toEqual(
      [
        'billingPeriod',
        'billingTiming',
        'displayLabel',
        'isDefault',
        'meteredEntitlementSlug',
        'unitAmountDecimal',
      ].sort(),
    );
  });

  it('clears a label that was emptied, with the empty string rather than by leaving it out', () => {
    expect(
      priceFormValuesToUpdateBody(flat({ displayLabel: '' })).displayLabel,
    ).toBe('');
    expect(
      priceFormValuesToUpdateBody(flat({ displayLabel: '  ' })).displayLabel,
    ).toBe('');
  });

  it('keeps a metered price in arrears with no period and no default', () => {
    expect(
      priceFormValuesToUpdateBody(
        metered({ billingPeriod: 'MONTHLY', isDefault: true }),
      ),
    ).toMatchObject({
      billingPeriod: undefined,
      billingTiming: 'ARREARS',
      isDefault: undefined,
      meteredEntitlementSlug: 'traces',
      unitAmountDecimal: '8',
    });
  });
});

describe('the form of an existing price', () => {
  it('reads its amount back in major units, as it is typed', () => {
    expect(
      priceToFormValues(
        buildPrice({
          displayLabel: 'Pro, monthly',
          id: 'price-1',
          isDefault: true,
          unitAmountDecimal: '2900',
        }),
      ),
    ).toEqual({
      amount: '29.00',
      billingModel: 'FLAT_FEE',
      billingPeriod: 'MONTHLY',
      billingTiming: 'ADVANCE',
      currency: 'USD',
      displayLabel: 'Pro, monthly',
      isDefault: true,
      meteredEntitlementSlug: '',
    });
  });

  it('keeps the decimals of a price per unit', () => {
    const values = priceToFormValues(
      buildPrice({
        billingModel: 'USAGE_BASED',
        billingPeriod: undefined,
        billingTiming: 'ARREARS',
        id: 'price-2',
        metered: { entitlementSlug: 'tokens', saleUnitFactor: '1000000' },
        unitAmountDecimal: '7.5',
      }),
    );

    expect(values.amount).toBe('0.075');
    expect(values.meteredEntitlementSlug).toBe('tokens');
  });

  it('round-trips: what is read is what is sent', () => {
    const price = buildPrice({ id: 'price-1', unitAmountDecimal: '2900' });

    expect(
      priceFormValuesToUpdateBody(priceToFormValues(price)).unitAmountDecimal,
    ).toBe('2900');
  });
});
