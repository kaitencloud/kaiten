import { describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';
import {
  describeDiscount,
  describeGrant,
  describeVoucherOffer,
  type VoucherOfferInput,
} from '../logic';

useBillingTexts();

const t = testI18n.t.bind(testI18n);
const names = { 'api-calls': 'API calls', seats: 'Seats', tokens: 'Tokens' };

const discount = (overrides: Partial<VoucherOfferInput> = {}) =>
  describeVoucherOffer(
    {
      duration: 'ONE_TIME',
      priceAppliesTo: 'LICENSE_BASE',
      priceDiscountType: 'PERCENTAGE',
      priceDiscountValue: '20',
      voucherType: 'PRICE',
      ...overrides,
    },
    { entitlementNames: names, language: 'en', t },
  );

const boost = (overrides: Partial<VoucherOfferInput> = {}) =>
  describeVoucherOffer(
    {
      duration: 'ONE_TIME',
      grants: [
        { entitlementSlug: 'tokens', modifierType: 'ADD', modifierValue: '50000' },
      ],
      voucherType: 'ENTITLEMENT_BOOST',
      ...overrides,
    },
    { entitlementNames: names, language: 'en', t },
  );

describe('the discount of a voucher', () => {
  it('writes a percentage as one, with decimals when it has some', () => {
    expect(
      describeDiscount({ priceDiscountType: 'PERCENTAGE', priceDiscountValue: '20' }, 'en'),
    ).toBe('20%');
    expect(
      describeDiscount({ priceDiscountType: 'PERCENTAGE', priceDiscountValue: '12.5' }, 'en'),
    ).toBe('12.5%');
  });

  it('writes an amount from its minor units, in its currency', () => {
    expect(
      describeDiscount(
        { currency: 'USD', priceDiscountType: 'FIXED_AMOUNT', priceDiscountValue: '5000' },
        'en',
      ),
    ).toBe('$50.00');
    expect(
      describeDiscount(
        { currency: 'JPY', priceDiscountType: 'FIXED_AMOUNT', priceDiscountValue: '500' },
        'en',
      ),
    ).toBe('¥500');
  });

  it('writes what it cannot read as it is, rather than as a number it is not', () => {
    expect(
      describeDiscount(
        { currency: 'USD', priceDiscountType: 'FIXED_AMOUNT', priceDiscountValue: '12.5' },
        'en',
      ),
    ).toBe('12.5 USD');
    expect(
      describeDiscount({ priceDiscountType: 'PERCENTAGE', priceDiscountValue: 'abc' }, 'en'),
    ).toBe('abc');
  });
});

describe('what a voucher does, in plain language', () => {
  it('counts the invoices a discount lasts, and says what it applies to', () => {
    expect(discount()).toBe('20% off the base price, on one invoice');
    expect(discount({ duration: 'REPEATING', durationInPeriods: 12 })).toBe(
      '20% off the base price, on the next 12 invoices',
    );
    expect(discount({ duration: 'REPEATING', durationInPeriods: 1 })).toBe(
      '20% off the base price, on the next invoice',
    );
    expect(discount({ duration: 'FOREVER', priceAppliesTo: 'ADDONS' })).toBe(
      '20% off the add-ons, on every invoice',
    );
    expect(discount({ priceAppliesTo: 'BOTH' })).toBe(
      '20% off the base price and the add-ons, on one invoice',
    );
  });

  it('counts the chosen prices, those of a license and those of an add-on together', () => {
    expect(
      discount({
        applicableAddonPriceIds: ['a'],
        applicableLicensePriceIds: ['b', 'c'],
        priceAppliesTo: 'SELECTED_PRICES',
      }),
    ).toBe('20% off the 3 selected prices, on one invoice');
    expect(
      discount({ applicableLicensePriceIds: ['b'], priceAppliesTo: 'SELECTED_PRICES' }),
    ).toBe('20% off the selected price, on one invoice');
  });

  it('writes a fixed amount in its currency', () => {
    expect(
      discount({
        currency: 'USD',
        priceDiscountType: 'FIXED_AMOUNT',
        priceDiscountValue: '5000',
      }),
    ).toBe('$50.00 off the base price, on one invoice');
  });

  it('counts the billing periods a boost lasts, and writes each change by the name of its entitlement', () => {
    expect(boost()).toBe('Tokens + 50,000, for one billing period');
    expect(
      boost({
        duration: 'REPEATING',
        durationInPeriods: 2,
        grants: [
          { entitlementSlug: 'tokens', modifierType: 'MULTIPLY', modifierValue: '2' },
          { entitlementSlug: 'seats', modifierType: 'SET', modifierValue: '10' },
          { entitlementSlug: 'api-calls', modifierType: 'UNLIMITED' },
        ],
      }),
    ).toBe('Tokens × 2, Seats set to 10, API calls unlimited, for 2 billing periods');
    expect(boost({ duration: 'FOREVER' })).toBe('Tokens + 50,000, with no end');
  });

  it('names an entitlement it does not know by its slug, and writes a value it cannot read as it is', () => {
    expect(
      describeGrant(
        { entitlementSlug: 'storage-gb', modifierType: 'ADD', modifierValue: '50' },
        { entitlementNames: names, t },
      ),
    ).toBe('storage-gb + 50');
    expect(
      describeGrant(
        { entitlementSlug: 'tokens', modifierType: 'ADD', modifierValue: 'lots' },
        { t },
      ),
    ).toBe('tokens + lots');
  });

  it('reads in French, with the number and the percentage in the way of the language', async () => {
    await testI18n.changeLanguage('fr');
    try {
      const sentence = describeVoucherOffer(
        {
          duration: 'REPEATING',
          durationInPeriods: 3,
          priceAppliesTo: 'LICENSE_BASE',
          priceDiscountType: 'PERCENTAGE',
          priceDiscountValue: '20',
          voucherType: 'PRICE',
        },
        { language: 'fr', t: testI18n.t.bind(testI18n) },
      );

      expect(sentence).toMatch(/^20\s%\sde remise sur le prix de base, sur les 3 prochaines factures$/);
    } finally {
      await testI18n.changeLanguage('en');
    }
  });
});
