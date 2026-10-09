import { describe, expect, it } from 'vite-plus/test';
import { buildVoucher } from '../../../../../e2e/app/_support/fixtures';
import {
  getVoucherEditErrors,
  voucherToEditBody,
  voucherToEditValues,
} from '../index';

const STORED = buildVoucher({
  applicableAddonIds: ['addon-1'],
  applicableLicenseIds: ['license-1'],
  code: 'WELCOME-SPRING-2027',
  description: 'Twenty off',
  duration: 'REPEATING',
  durationInPeriods: 3,
  expiresAt: '2027-06-30T23:59:00.000Z',
  id: 'voucher-welcome',
  maxRedemptions: 100,
  name: 'Welcome spring',
  priceAppliesTo: 'LICENSE_BASE',
  priceDiscountValue: '20',
  redemptionRules: {
    firstTimeOnly: true,
    minimumSubscriptionAmount: { currency: 'USD', unitAmountDecimal: '10000' },
  },
  redemptionsCount: 2,
  restrictedCustomerSlug: 'hooli',
  startsAt: '2027-01-01T00:00:00.000Z',
});

describe('what a published voucher lets change', () => {
  it('starts from the name, the description, the end of the window and the maximum it holds', () => {
    expect(voucherToEditValues(STORED)).toEqual({
      description: 'Twenty off',
      expiresAt: '2027-06-30T23:59',
      maxRedemptions: 100,
      name: 'Welcome spring',
    });
    expect(voucherToEditValues(buildVoucher({ code: 'ABCDEFGH', id: 'v', name: 'N' }))).toEqual({
      description: '',
      expiresAt: '',
      maxRedemptions: Number.NaN,
      name: 'N',
    });
  });

  it('needs a name, and a date and a maximum that are what they say, and lets the description and the end be empty', () => {
    const values = voucherToEditValues(STORED);

    expect(getVoucherEditErrors(values, STORED)).toBeUndefined();
    expect(getVoucherEditErrors({ ...values, name: ' ' }, STORED)).toEqual({
      name: 'Pages.Vouchers.Edit.Errors.name',
    });
    expect(getVoucherEditErrors({ ...values, expiresAt: 'soon' }, STORED)).toEqual({
      expiresAt: 'Pages.Vouchers.Edit.Errors.date',
    });
    expect(getVoucherEditErrors({ ...values, maxRedemptions: 0 }, STORED)).toEqual({
      maxRedemptions: 'Pages.Vouchers.Edit.Errors.maxRedemptions',
    });
    expect(
      getVoucherEditErrors({ ...values, description: '', expiresAt: '', maxRedemptions: Number.NaN }, STORED),
    ).toBeUndefined();
  });

  it('says before it is asked that the maximum cannot go under the redemptions already made', () => {
    const values = voucherToEditValues(STORED);

    expect(getVoucherEditErrors({ ...values, maxRedemptions: 1 }, STORED)).toEqual({
      maxRedemptions: 'Pages.Vouchers.Edit.Errors.belowCount',
    });
    expect(getVoucherEditErrors({ ...values, maxRedemptions: 2 }, STORED)).toBeUndefined();
  });

  it('restates the voucher as stored with the four members the person changed, since the API compares the rest with what it holds', () => {
    const body = voucherToEditBody(STORED, {
      description: '  Thirty off  ',
      expiresAt: '2027-09-30T12:00',
      maxRedemptions: 200,
      name: ' Welcome spring 2027 ',
    });

    expect(body).toEqual({
      applicableAddonIds: ['addon-1'],
      applicableAddonPriceIds: [],
      applicableLicenseIds: ['license-1'],
      applicableLicensePriceIds: [],
      code: 'WELCOME-SPRING-2027',
      currency: undefined,
      description: 'Thirty off',
      duration: 'REPEATING',
      durationInPeriods: 3,
      expiresAt: '2027-09-30T12:00:00.000Z',
      grants: [],
      maxRedemptions: 200,
      name: 'Welcome spring 2027',
      priceAppliesTo: 'LICENSE_BASE',
      priceDiscountType: 'PERCENTAGE',
      priceDiscountValue: '20',
      redemptionRules: STORED.redemptionRules,
      restrictedCustomerSlug: 'hooli',
      startsAt: '2027-01-01T00:00:00.000Z',
      voucherType: 'PRICE',
    });
  });

  it('leaves out an empty description, an empty end and an empty maximum, which the API takes as none', () => {
    const body = voucherToEditBody(STORED, {
      description: '   ',
      expiresAt: '',
      maxRedemptions: Number.NaN,
      name: 'Welcome spring',
    });

    expect(body.description).toBeUndefined();
    expect(body.expiresAt).toBeUndefined();
    expect(body.maxRedemptions).toBeUndefined();
  });

  it('sends the grants of a boost as stored, which the API compares and does not rewrite', () => {
    const boost = buildVoucher({
      code: 'TOKENS-DOUBLE-Q4',
      grants: [{ entitlementSlug: 'tokens', modifierType: 'ADD', modifierValue: '5' }],
      id: 'voucher-boost',
      name: 'Boost',
      voucherType: 'ENTITLEMENT_BOOST',
    });

    expect(voucherToEditBody(boost, voucherToEditValues(boost)).grants).toEqual(boost.grants);
  });
});
