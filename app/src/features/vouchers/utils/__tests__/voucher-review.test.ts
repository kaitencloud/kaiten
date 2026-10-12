import { describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';
import type { VoucherNames } from '../../types';
import { describeVoucherReview, type VoucherReviewInput } from '../voucher-review';

useBillingTexts();

const NAMES: VoucherNames = {
  addons: { 'addon-1': 'Extra seats 2026' },
  customers: { hooli: 'Hooli' },
  entitlements: { tokens: 'Tokens' },
  licenses: { 'license-1': 'Pro v2' },
  prices: {},
};

const DISCOUNT: VoucherReviewInput = {
  duration: 'REPEATING',
  durationInPeriods: 12,
  priceAppliesTo: 'LICENSE_BASE',
  priceDiscountType: 'PERCENTAGE',
  priceDiscountValue: '30',
  redemptionRules: {},
  voucherType: 'PRICE',
};

const review = (voucher: VoucherReviewInput, language = 'en') =>
  describeVoucherReview(voucher, {
    language,
    names: NAMES,
    t: testI18n.t.bind(testI18n),
  });

describe('a voucher in plain language', () => {
  it('says one thing a line: what it does for how long, how often it can be redeemed, for whom and until when', () => {
    expect(review({ ...DISCOUNT, maxRedemptions: 100 })).toEqual([
      '30% off the base price, on the next 12 invoices.',
      'It can be redeemed 100 times.',
      'Any customer can redeem it, once per instance.',
      'It has no end date.',
    ]);
  });

  it('counts a discount in invoices and a boost in billing periods', () => {
    expect(
      review({
        duration: 'REPEATING',
        durationInPeriods: 2,
        grants: [{ entitlementSlug: 'tokens', modifierType: 'MULTIPLY', modifierValue: '2' }],
        redemptionRules: {},
        voucherType: 'ENTITLEMENT_BOOST',
      })[0],
    ).toBe('Tokens × 2, for 2 billing periods.');
  });

  it('says it is reserved for a customer, by name, and the versions it is limited to, by name', () => {
    expect(
      review({
        ...DISCOUNT,
        applicableAddonIds: ['addon-1'],
        applicableLicenseIds: ['license-1'],
        maxRedemptions: 1,
        restrictedCustomerSlug: 'hooli',
      }),
    ).toEqual([
      '30% off the base price, on the next 12 invoices.',
      'It can be redeemed once.',
      'It is reserved for Hooli.',
      'It applies only to instances on Pro v2 that hold Extra seats 2026.',
      'It has no end date.',
    ]);
  });

  it('says what it is limited to when it is limited to one kind of version only', () => {
    expect(review({ ...DISCOUNT, applicableLicenseIds: ['license-1'] })).toContain(
      'It applies only to instances on Pro v2.',
    );
    expect(review({ ...DISCOUNT, applicableAddonIds: ['addon-1'] })).toContain(
      'It applies only to instances that hold Extra seats 2026.',
    );
  });

  it('names a customer and a version the console cannot name by its slug, and by a word for the others', () => {
    const sentences = review({
      ...DISCOUNT,
      applicableLicenseIds: ['license-9'],
      restrictedCustomerSlug: 'globex',
    });

    expect(sentences).toContain('It is reserved for globex.');
    expect(sentences).toContain(
      'It applies only to instances on a version that is not listed.',
    );
  });

  it('writes the window in UTC, whichever of its ends are given', () => {
    expect(
      review({ ...DISCOUNT, expiresAt: '2027-06-30T23:59:00.000Z', startsAt: '2027-01-01T00:00:00.000Z' }),
    ).toContain('It can be redeemed from Jan 1, 2027 (UTC) to Jun 30, 2027 (UTC).');
    expect(review({ ...DISCOUNT, expiresAt: '2027-06-30T23:59:00.000Z' })).toContain(
      'It can be redeemed until Jun 30, 2027 (UTC).',
    );
    expect(review({ ...DISCOUNT, startsAt: '2027-01-01T00:00:00.000Z' })).toContain(
      'It can be redeemed from Jan 1, 2027 (UTC).',
    );
  });

  it('says each condition of the rules, with the minimum in the currency it was given in', () => {
    expect(
      review({
        ...DISCOUNT,
        redemptionRules: {
          annualOnly: true,
          firstTimeOnly: true,
          minimumSubscriptionAmount: { currency: 'USD', unitAmountDecimal: '100000' },
        },
      }).slice(-3),
    ).toEqual([
      'Only customers that have not paid an invoice yet can redeem it.',
      'Only instances with an annual subscription can redeem it.',
      'The base price of the subscription must be at least $1,000.00.',
    ]);
  });

  it('says it has no limit when it has none', () => {
    expect(review(DISCOUNT)[1]).toBe('It has no limit on the number of redemptions.');
  });

  it('reads in French', async () => {
    await testI18n.changeLanguage('fr');
    try {
      expect(review({ ...DISCOUNT, maxRedemptions: 100 }, 'fr')).toEqual([
        expect.stringMatching(/^30\s%\sde remise sur le prix de base, sur les 12 prochaines factures\.$/),
        'Il peut être utilisé 100 fois.',
        'Tout client peut l’utiliser, une fois par instance.',
        'Il n’a pas de date de fin.',
      ]);
    } finally {
      await testI18n.changeLanguage('en');
    }
  });
});
