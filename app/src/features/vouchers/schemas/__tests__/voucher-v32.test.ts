import { describe, expect, it } from 'vite-plus/test';
import { zVoucherDraft } from '@/api-client/zod.gen';
import { buildVoucher } from '../../../../../e2e/app/_support/fixtures';
import { initialVoucherFormValues, newGrant, voucherFormValuesToBody, voucherToFormValues, getStepErrors } from '../index';

describe('v3.2 voucher offers', () => {
  it('sends a flag family without a price or boost and refuses duplicate flags', () => {
    const values = { ...initialVoucherFormValues, name: 'Preview', voucherType: 'FLAG_GRANT' as const, flagGrants: [{ key: 'one', flagSlug: 'preview', variant: 'on' }] };
    const body = voucherFormValuesToBody(values);
    expect(zVoucherDraft.safeParse(body).success).toBe(true);
    expect(body.flagGrants).toEqual([{ flagSlug: 'preview', variant: 'on' }]);
    expect(body.priceDiscountType).toBeUndefined();
    expect(body.grants).toBeUndefined();
    expect(getStepErrors('offer', values)).toEqual({});
    expect(getStepErrors('offer', { ...values, flagGrants: [...values.flagGrants, { ...values.flagGrants[0]!, key: 'two' }] })).toHaveProperty('flagGrants[1].flagSlug');
  });

  it('requires two composite families and sends only those selected', () => {
    const values = { ...initialVoucherFormValues, name: 'Bundle', voucherType: 'COMPOSITE' as const, percentage: '20', hasFlags: true, flagGrants: [{ key: 'one', flagSlug: 'preview', variant: 'on' }] };
    expect(getStepErrors('offer', { ...values, hasFlags: false })).toHaveProperty('hasPrice');
    expect(getStepErrors('offer', values)).toEqual({});
    const body = voucherFormValuesToBody(values);
    expect(body.priceDiscountValue).toBe('20');
    expect(body.flagGrants).toHaveLength(1);
    expect(body.grants).toBeUndefined();
  });

  it('sends false and CONFIG objects in value and round trips a draft', () => {
    const values = { ...initialVoucherFormValues, name: 'Typed boost', voucherType: 'ENTITLEMENT_BOOST' as const, grants: [
      { ...newGrant(), entitlementSlug: 'sso', entitlementType: 'BOOLEAN' as const, modifierType: 'SET' as const, booleanValue: false },
      { ...newGrant(), entitlementSlug: 'settings', entitlementType: 'CONFIG' as const, modifierType: 'SET' as const, jsonValue: '{"retention":30}' },
    ] };
    expect(getStepErrors('offer', values)).toEqual({});
    const body = voucherFormValuesToBody(values);
    expect(body.grants).toEqual([{ entitlementSlug: 'sso', modifierType: 'SET', value: false }, { entitlementSlug: 'settings', modifierType: 'SET', value: { retention: 30 } }]);
    const stored = { ...buildVoucher({ code: 'TYPED-BOOST-TEST', id: 'typed', name: 'Typed', voucherType: 'ENTITLEMENT_BOOST', status: 'DRAFT' }), grants: body.grants! };
    expect(voucherFormValuesToBody(voucherToFormValues(stored)).grants).toEqual(body.grants);
    for (const jsonValue of ['[]', 'null', '"text"', '{']) {
      expect(getStepErrors('offer', { ...values, grants: [{ ...values.grants[1]!, jsonValue }] })).toHaveProperty('grants[0].jsonValue');
    }
  });
});
