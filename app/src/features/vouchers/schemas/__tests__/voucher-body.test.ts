import { describe, expect, it } from 'vite-plus/test';
import { buildVoucher } from '../../../../../e2e/app/_support/fixtures';
import {
  boostLikeToFormValues,
  initialVoucherFormValues,
  newGrant,
  redemptionRulesToBody,
  redemptionRulesToFormValues,
  voucherFormValuesToBody,
  type VoucherFormValues,
  voucherToFormValues,
} from '../index';

const form = (overrides: Partial<VoucherFormValues> = {}): VoucherFormValues => ({
  ...initialVoucherFormValues,
  name: 'Welcome',
  percentage: '20',
  ...overrides,
});

describe('the body of a discount', () => {
  it('sends the percentage as the text typed and what it applies to, with no grants, no currency and no limit it was not given', () => {
    expect(voucherFormValuesToBody(form({ name: ' Welcome 20 ' }))).toEqual({
      applicableAddonIds: [],
      applicableAddonPriceIds: [],
      applicableLicenseIds: [],
      applicableLicensePriceIds: [],
      code: undefined,
      currency: undefined,
      description: undefined,
      duration: 'ONE_TIME',
      durationInPeriods: undefined,
      expiresAt: undefined,
      grants: undefined,
      maxRedemptions: undefined,
      name: 'Welcome 20',
      priceAppliesTo: 'LICENSE_BASE',
      priceDiscountType: 'PERCENTAGE',
      priceDiscountValue: '20',
      redemptionRules: {},
      restrictedCustomerSlug: undefined,
      startsAt: undefined,
      voucherType: 'PRICE',
    });
  });

  it('reads a decimal comma as a decimal point', () => {
    expect(voucherFormValuesToBody(form({ percentage: '12,5' })).priceDiscountValue).toBe(
      '12.5',
    );
  });

  it('sends a fixed amount in minor units with its currency', () => {
    expect(
      voucherFormValuesToBody(
        form({ amount: '50', currency: 'USD', priceDiscountType: 'FIXED_AMOUNT' }),
      ),
    ).toMatchObject({
      currency: 'USD',
      priceDiscountType: 'FIXED_AMOUNT',
      priceDiscountValue: '5000',
    });
  });

  it('sends the number of times only when the offer repeats', () => {
    expect(
      voucherFormValuesToBody(form({ duration: 'REPEATING', durationInPeriods: 12 })),
    ).toMatchObject({ duration: 'REPEATING', durationInPeriods: 12 });
    expect(
      voucherFormValuesToBody(form({ duration: 'FOREVER', durationInPeriods: 12 })),
    ).toMatchObject({ duration: 'FOREVER', durationInPeriods: undefined });
  });

  it('sends the chosen prices only when the discount applies to chosen prices', () => {
    const prices = {
      applicableAddonPriceIds: ['a1'],
      applicableLicensePriceIds: ['l1', 'l2'],
    };

    expect(
      voucherFormValuesToBody(form({ ...prices, priceAppliesTo: 'SELECTED_PRICES' })),
    ).toMatchObject({
      applicableAddonPriceIds: ['a1'],
      applicableLicensePriceIds: ['l1', 'l2'],
      priceAppliesTo: 'SELECTED_PRICES',
    });
    expect(
      voucherFormValuesToBody(form({ ...prices, priceAppliesTo: 'BOTH' })),
    ).toMatchObject({
      applicableAddonPriceIds: [],
      applicableLicensePriceIds: [],
      priceAppliesTo: 'BOTH',
    });
  });

  it('sends the code, the customer, the versions, the limits and the window that were given, as UTC instants, and leaves out what is blank', () => {
    expect(
      voucherFormValuesToBody(
        form({
          applicableAddonIds: ['addon-1'],
          applicableLicenseIds: ['license-1'],
          code: ' SPRING2027 ',
          description: '  Twenty off  ',
          expiresAt: '2027-06-30T23:59',
          maxRedemptions: 100,
          restrictedCustomerSlug: ' hooli ',
          startsAt: '2027-01-01T00:00',
        }),
      ),
    ).toMatchObject({
      applicableAddonIds: ['addon-1'],
      applicableLicenseIds: ['license-1'],
      code: 'SPRING2027',
      description: 'Twenty off',
      expiresAt: '2027-06-30T23:59:00.000Z',
      maxRedemptions: 100,
      restrictedCustomerSlug: 'hooli',
      startsAt: '2027-01-01T00:00:00.000Z',
    });
  });
});

describe('the body of a boost', () => {
  const boost = (overrides: Partial<VoucherFormValues> = {}) =>
    form({
      grants: [
        {
          ...newGrant(),
          entitlementSlug: 'tokens',
          modifierType: 'MULTIPLY',
          modifierValue: '2,5',
        },
        { ...newGrant(), entitlementSlug: 'seats', modifierType: 'UNLIMITED' },
      ],
      voucherType: 'ENTITLEMENT_BOOST',
      ...overrides,
    });

  it('sends the changes, without the key that tells the rows apart and without a value for lifting the limit', () => {
    expect(voucherFormValuesToBody(boost()).grants).toEqual([
      { entitlementSlug: 'tokens', modifierType: 'MULTIPLY', modifierValue: '2.5' },
      { entitlementSlug: 'seats', modifierType: 'UNLIMITED' },
    ]);
  });

  it('carries no price member: what the discount side of the form still holds is not sent', () => {
    const body = voucherFormValuesToBody(
      boost({ amount: '50', currency: 'USD', percentage: '20', priceAppliesTo: 'BOTH' }),
    );

    expect(body).not.toHaveProperty('priceDiscountType');
    expect(body).not.toHaveProperty('priceDiscountValue');
    expect(body).not.toHaveProperty('priceAppliesTo');
    expect(body).not.toHaveProperty('currency');
  });

  it('carries no grants when it is a discount, whatever the form holds of a boost', () => {
    expect(
      voucherFormValuesToBody(form({ grants: [{ ...newGrant(), entitlementSlug: 'tokens' }] }))
        .grants,
    ).toBeUndefined();
  });
});

describe('the rules of eligibility', () => {
  it('sends a flag that is on, and the minimum in minor units of its currency, in the one place that knows its shape', () => {
    expect(
      redemptionRulesToBody({
        annualOnly: true,
        firstTimeOnly: false,
        minimumAmount: '1000',
        minimumCurrency: 'USD',
      }),
    ).toEqual({
      annualOnly: true,
      minimumSubscriptionAmount: { currency: 'USD', unitAmountDecimal: '100000' },
    });
  });

  it('sends nothing for rules that were not set, and no minimum without its amount or its currency', () => {
    const none = { annualOnly: false, firstTimeOnly: false };

    expect(redemptionRulesToBody({ ...none, minimumAmount: '', minimumCurrency: 'USD' })).toEqual({});
    expect(redemptionRulesToBody({ ...none, minimumAmount: '100', minimumCurrency: '' })).toEqual({});
  });

  it('gives back to the form what was sent, in major units', () => {
    expect(
      redemptionRulesToFormValues({
        firstTimeOnly: true,
        minimumSubscriptionAmount: { currency: 'EUR', unitAmountDecimal: '25050' },
      }),
    ).toEqual({
      annualOnly: false,
      firstTimeOnly: true,
      minimumAmount: '250.50',
      minimumCurrency: 'EUR',
    });
    expect(redemptionRulesToFormValues({})).toEqual({
      annualOnly: false,
      firstTimeOnly: false,
      minimumAmount: '',
      minimumCurrency: '',
    });
  });
});

describe('a voucher that exists, as the form of the wizard', () => {
  const BOOST = buildVoucher({
    applicableAddonIds: ['addon-1'],
    code: 'TOKENS-DOUBLE-Q4',
    description: 'Double the tokens',
    duration: 'REPEATING',
    durationInPeriods: 2,
    expiresAt: '2027-06-30T23:59:00.000Z',
    grants: [
      { entitlementSlug: 'tokens', modifierType: 'MULTIPLY', modifierValue: '2' },
      { entitlementSlug: 'seats', modifierType: 'UNLIMITED' },
    ],
    id: 'voucher-boost',
    maxRedemptions: 3,
    name: 'Tokens times two',
    redemptionRules: { annualOnly: true },
    restrictedCustomerSlug: 'hooli',
    startsAt: '2027-01-01T00:00:00.000Z',
    voucherType: 'ENTITLEMENT_BOOST',
  });
  const FIXED = buildVoucher({
    applicableLicensePriceIds: ['l1'],
    code: 'EURO-CREDIT-25',
    currency: 'EUR',
    id: 'voucher-euro',
    name: 'Euro credit',
    priceAppliesTo: 'SELECTED_PRICES',
    priceDiscountType: 'FIXED_AMOUNT',
    priceDiscountValue: '2500',
    redemptionRules: {
      minimumSubscriptionAmount: { currency: 'EUR', unitAmountDecimal: '10000' },
    },
  });
  const PERCENT = buildVoucher({
    code: 'LAUNCH-20-OFF',
    duration: 'FOREVER',
    id: 'voucher-launch',
    name: 'Launch discount',
    priceDiscountValue: '12.5',
  });

  it.each([BOOST, FIXED, PERCENT])(
    'comes back to the body it was made from, so that a draft finished in the wizard is the same voucher ($name)',
    (voucher) => {
      const body = voucherFormValuesToBody(voucherToFormValues(voucher));

      expect(body).toMatchObject({
        applicableAddonIds: voucher.applicableAddonIds,
        code: voucher.code,
        duration: voucher.duration,
        durationInPeriods: voucher.durationInPeriods,
        expiresAt: voucher.expiresAt,
        maxRedemptions: voucher.maxRedemptions,
        name: voucher.name,
        redemptionRules: voucher.redemptionRules,
        restrictedCustomerSlug: voucher.restrictedCustomerSlug,
        startsAt: voucher.startsAt,
        voucherType: voucher.voucherType,
      });
      if (voucher.voucherType === 'ENTITLEMENT_BOOST') {
        expect(body.grants).toEqual(voucher.grants);
      } else {
        expect(body).toMatchObject({
          applicableLicensePriceIds: voucher.applicableLicensePriceIds,
          currency: voucher.currency,
          priceAppliesTo: voucher.priceAppliesTo,
          priceDiscountType: voucher.priceDiscountType,
          priceDiscountValue: voucher.priceDiscountValue,
        });
        expect(body.grants).toBeUndefined();
      }
    },
  );

  it('holds an amount in the major units it is typed in, and a percentage as the text the API stores', () => {
    expect(voucherToFormValues(FIXED)).toMatchObject({
      amount: '25.00',
      currency: 'EUR',
      minimumAmount: '100.00',
      minimumCurrency: 'EUR',
      percentage: '',
    });
    expect(voucherToFormValues(PERCENT)).toMatchObject({ amount: '', percentage: '12.5' });
  });

  it('gives each change a key of its own, and an empty value to lifting a limit', () => {
    const { grants } = voucherToFormValues(BOOST);

    expect(grants).toHaveLength(2);
    expect(grants[0].key).not.toBe(grants[1].key);
    expect(grants[1]).toMatchObject({ modifierType: 'UNLIMITED', modifierValue: '' });
  });

  it('starts a boost for the same offer from the duration, the eligibility and the limits, with a code of its own to be generated', () => {
    const boost = boostLikeToFormValues(PERCENT, 'Launch discount (boost)');

    expect(boost).toMatchObject({
      code: '',
      duration: 'FOREVER',
      grants: [],
      name: 'Launch discount (boost)',
      voucherType: 'ENTITLEMENT_BOOST',
    });
    expect(boost.description).toBe('');
    // What belongs to the discount is not carried to the boost.
    expect(boost.percentage).toBe('');
    expect(boost.priceAppliesTo).toBe('LICENSE_BASE');
  });
});
