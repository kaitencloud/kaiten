import { describe, expect, it } from 'vite-plus/test';
import {
  getRedeemVoucherFormErrors,
  initialRedeemVoucherFormValues,
  redeemVoucherFormSchema,
} from '../redeem-voucher.schema';

const BASE = 'Pages.Customers.Instances.Detail.Billing.Vouchers.Redeem.Errors';

describe('the code a person applies to an instance', () => {
  it('needs something typed, which spaces are not', () => {
    expect(getRedeemVoucherFormErrors(initialRedeemVoucherFormValues)).toEqual({
      code: `${BASE}.code`,
    });
    expect(getRedeemVoucherFormErrors({ code: '   ' })).toEqual({ code: `${BASE}.code` });
  });

  it('is not judged beyond that: whether it exists, is in force and fits the instance is the API to say', () => {
    expect(getRedeemVoucherFormErrors({ code: 'x' })).toBeUndefined();
    expect(getRedeemVoucherFormErrors({ code: 'welcome spring 2027' })).toBeUndefined();
  });

  it('is at most what the API takes', () => {
    expect(getRedeemVoucherFormErrors({ code: 'x'.repeat(64) })).toBeUndefined();
    expect(getRedeemVoucherFormErrors({ code: 'x'.repeat(65) })).toEqual({
      code: `${BASE}.codeTooLong`,
    });
  });

  it('is sent without the spaces around it', () => {
    expect(redeemVoucherFormSchema.parse({ code: '  WELCOME-2027  ' })).toEqual({
      code: 'WELCOME-2027',
    });
  });
});
