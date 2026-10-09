import { describe, expect, it } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { getValidityReasonKey } from '../voucher-validity';

const read = (locale: unknown, key: string) =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      locale,
    );

const BASE = 'Pages.Customers.Instances.Detail.Billing.Vouchers';

describe('why a code cannot be redeemed by an instance', () => {
  it('says the first check that failed, which is all the API says', () => {
    expect(getValidityReasonKey({ reason: 'NOT_FOUND' })).toBe(`${BASE}.Reasons.NOT_FOUND`);
    expect(getValidityReasonKey({ reason: 'EXPIRED' })).toBe(`${BASE}.Reasons.EXPIRED`);
    expect(getValidityReasonKey({ reason: 'EXHAUSTED' })).toBe(`${BASE}.Reasons.EXHAUSTED`);
    expect(getValidityReasonKey({ reason: 'ALREADY_REDEEMED' })).toBe(
      `${BASE}.Reasons.ALREADY_REDEEMED`,
    );
    expect(getValidityReasonKey({ reason: 'CURRENCY_MISMATCH' })).toBe(
      `${BASE}.Reasons.CURRENCY_MISMATCH`,
    );
  });

  it('says the condition an instance breaks, which is more useful than that it is not eligible', () => {
    expect(getValidityReasonKey({ reason: 'NOT_ELIGIBLE', rule: 'RESTRICTED_CUSTOMER' })).toBe(
      `${BASE}.Rules.RESTRICTED_CUSTOMER`,
    );
    expect(getValidityReasonKey({ reason: 'NOT_ELIGIBLE', rule: 'ANNUAL_ONLY' })).toBe(
      `${BASE}.Rules.ANNUAL_ONLY`,
    );
  });

  it('says that the instance is not eligible when the API names no rule', () => {
    expect(getValidityReasonKey({ reason: 'NOT_ELIGIBLE' })).toBe(`${BASE}.Reasons.NOT_ELIGIBLE`);
  });

  it('says nothing of a code that is valid', () => {
    expect(getValidityReasonKey({})).toBeNull();
  });

  it('has a sentence in English and in French for every reason and every rule', () => {
    const reasons = [
      'NOT_FOUND', 'NOT_ACTIVE', 'NOT_YET_VALID', 'EXPIRED', 'EXHAUSTED',
      'ALREADY_REDEEMED', 'NOT_ELIGIBLE', 'CURRENCY_MISMATCH',
    ] as const;
    const rules = [
      'RESTRICTED_CUSTOMER', 'LICENSE_NOT_APPLICABLE', 'ADDON_NOT_APPLICABLE',
      'FIRST_TIME_ONLY', 'ANNUAL_ONLY', 'MINIMUM_SUBSCRIPTION_AMOUNT', 'NOTHING_TO_BOOST',
    ] as const;
    const keys = [
      ...reasons.map((reason) => getValidityReasonKey({ reason })),
      ...rules.map((rule) => getValidityReasonKey({ reason: 'NOT_ELIGIBLE', rule })),
    ];

    expect(keys).toHaveLength(15);
    for (const key of keys) {
      expect(read(en, key as string), String(key)).toEqual(expect.any(String));
      expect(read(fr, key as string), String(key)).toEqual(expect.any(String));
    }
  });
});
