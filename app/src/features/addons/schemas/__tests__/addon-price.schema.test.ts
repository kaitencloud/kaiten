import { describe, expect, it } from 'vite-plus/test';
import {
  addonPriceFormSchema,
  addonPriceFormValuesToCreateBody,
  initialAddonPriceFormValues,
  type AddonPriceFormValues,
} from '../addon-price.schema';

const values = (overrides: Partial<AddonPriceFormValues> = {}): AddonPriceFormValues => ({
  ...initialAddonPriceFormValues('USD', false),
  amount: '10.00',
  ...overrides,
});

const issues = (input: AddonPriceFormValues) =>
  Object.fromEntries(
    (addonPriceFormSchema.safeParse(input).error?.issues ?? []).map((issue) => [
      String(issue.path[0]),
      issue.message,
    ]),
  );

describe('what the form of a price opens with', () => {
  it('is monthly, in advance, in the currency of the version, with nothing typed', () => {
    expect(initialAddonPriceFormValues('EUR', false)).toEqual({
      amount: '',
      billingPeriod: 'MONTHLY',
      billingTiming: 'ADVANCE',
      currency: 'EUR',
      displayLabel: '',
      isDefault: false,
    });
  });

  it('is the default of its period when the period has none yet', () => {
    expect(initialAddonPriceFormValues('USD', true).isDefault).toBe(true);
  });
});

describe('what a price needs', () => {
  it('is an amount, written in major units as the currency writes them', () => {
    expect(issues(values())).toEqual({});
    expect(issues(values({ amount: '10' }))).toEqual({});
    for (const amount of ['', 'abc', '-1', '1.123456789012345', '1234567890123']) {
      expect(issues(values({ amount })), amount).toEqual({
        amount: 'Pages.Addons.Prices.Form.Errors.amount',
      });
    }
  });

  it('takes a price below the minor unit, which a fee per sale unit may be', () => {
    expect(issues(values({ amount: '0.075' }))).toEqual({});
    expect(issues(values({ amount: '12,5' }))).toEqual({});
  });

  it('is in a currency of the ISO 4217 table', () => {
    expect(issues(values({ currency: 'XXX9' }))).toMatchObject({
      currency: 'Pages.Addons.Prices.Form.Errors.currency',
    });
  });

  it('has a label of at most 200 characters', () => {
    expect(issues(values({ displayLabel: 'a'.repeat(200) }))).toEqual({});
    expect(issues(values({ displayLabel: 'a'.repeat(201) }))).toEqual({
      displayLabel: 'Pages.Addons.Prices.Form.Errors.label',
    });
  });
});

describe('the body of a new price', () => {
  it('is a flat fee, its amount in minor units, and the display order after the last price', () => {
    expect(addonPriceFormValuesToCreateBody(values({ isDefault: true }), 3)).toEqual({
      billingModel: 'FLAT_FEE',
      billingPeriod: 'MONTHLY',
      billingTiming: 'ADVANCE',
      currency: 'USD',
      displayLabel: undefined,
      displayOrder: 3,
      isDefault: true,
      unitAmountDecimal: '1000',
    });
  });

  it('leaves the label to the API when it is empty, and trims one that was typed', () => {
    expect(addonPriceFormValuesToCreateBody(values({ displayLabel: '   ' }), undefined).displayLabel).toBeUndefined();
    expect(
      addonPriceFormValuesToCreateBody(values({ displayLabel: ' Extra seat, annual ' }), undefined).displayLabel,
    ).toBe('Extra seat, annual');
  });

  it('writes an amount in the minor units of its currency, and a yen has none', () => {
    expect(addonPriceFormValuesToCreateBody(values({ amount: '1000', currency: 'JPY' }), 1).unitAmountDecimal).toBe('1000');
    expect(addonPriceFormValuesToCreateBody(values({ amount: '0.5' }), 1).unitAmountDecimal).toBe('50');
  });
});
