import { describe, expect, it } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import { getVoucherRefusalTarget } from '../index';

const refusal = (code: string, detail?: string, status = 422) =>
  new ApiError({ data: { code, detail, status }, status });

const PERCENT = { priceDiscountType: 'PERCENTAGE' } as const;
const FIXED = { priceDiscountType: 'FIXED_AMOUNT' } as const;

describe('where a refusal of a voucher is shown', () => {
  it.each([
    ['CreateVoucher.CodeConflict', 'code', 'eligibility'],
    ['CreateVoucher.InvalidCode', 'code', 'eligibility'],
    ['CreateVoucher.WeakCodeUnbounded', 'code', 'eligibility'],
    ['CreateVoucher.CustomerNotFound', 'restrictedCustomerSlug', 'eligibility'],
    ['CreateVoucher.LicenseNotFound', 'applicableLicenseIds', 'eligibility'],
    ['CreateVoucher.AddonNotFound', 'applicableAddonIds', 'eligibility'],
    ['CreateVoucher.InvalidWindow', 'expiresAt', 'eligibility'],
    ['CreateVoucher.InvalidRedemptionRules', 'minimumAmount', 'eligibility'],
    ['CreateVoucher.InvalidDuration', 'durationInPeriods', 'offer'],
    ['CreateVoucher.CurrencyRequired', 'currency', 'offer'],
    ['CreateVoucher.InvalidCurrency', 'currency', 'offer'],
    ['CreateVoucher.GrantsRequired', 'grants', 'offer'],
    ['CreateVoucher.DuplicateGrant', 'grants', 'offer'],
    ['CreateVoucher.InvalidGrant', 'grants', 'offer'],
    ['CreateVoucher.EntitlementNotFound', 'grants', 'offer'],
    ['CreateVoucher.BoostUnsupportedEntitlementType', 'grants', 'offer'],
    ['CreateVoucher.SelectedPricesRequired', 'applicableLicensePriceIds', 'offer'],
    ['CreateVoucher.PriceNotFound', 'applicableLicensePriceIds', 'offer'],
    ['CreateVoucher.UnsupportedType', 'voucherType', 'type'],
  ])('puts %s on %s, in the %s step', (code, field, step) => {
    expect(getVoucherRefusalTarget(refusal(code, 'the API words'), PERCENT)).toEqual({
      field,
      message: 'the API words',
      step,
    });
  });

  it('reads the update of a draft as it reads its creation: the code of the refusal without its operation', () => {
    expect(
      getVoucherRefusalTarget(refusal('UpdateVoucher.CodeConflict', 'taken'), PERCENT),
    ).toEqual({ field: 'code', message: 'taken', step: 'eligibility' });
  });

  it('puts a refusal of the discount on the percentage or on the amount, whichever the voucher takes', () => {
    const invalid = refusal('CreateVoucher.InvalidDiscount', 'out of range');

    expect(getVoucherRefusalTarget(invalid, PERCENT)).toEqual({
      field: 'percentage',
      message: 'out of range',
      step: 'offer',
    });
    expect(getVoucherRefusalTarget(invalid, FIXED)).toEqual({
      field: 'amount',
      message: 'out of range',
      step: 'offer',
    });
  });

  it('puts none on a field when it is about none: it is shown above the buttons', () => {
    expect(getVoucherRefusalTarget(refusal('Billing.Down', 'be back', 503), PERCENT)).toBeNull();
    expect(
      getVoucherRefusalTarget(refusal('CreateVoucher.SomethingNew', 'new'), PERCENT),
    ).toBeNull();
    expect(getVoucherRefusalTarget(new Error('network'), PERCENT)).toBeNull();
  });

  it('puts none on a field without the words of the API to show there', () => {
    expect(getVoucherRefusalTarget(refusal('CreateVoucher.InvalidCode'), PERCENT)).toBeNull();
  });
});
