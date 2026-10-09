import { describe, expect, it } from 'vite-plus/test';
import {
  getStepErrors,
  getVoucherFormErrors,
  initialVoucherFormValues,
  isModifierValue,
  isStepValid,
  newGrant,
  readFixedAmount,
  readPercentage,
  type VoucherFormValues,
} from '../index';

const values = (overrides: Partial<VoucherFormValues> = {}): VoucherFormValues => ({
  ...initialVoucherFormValues,
  name: 'Welcome',
  percentage: '20',
  ...overrides,
});

const grant = (overrides: Partial<ReturnType<typeof newGrant>> = {}) => ({
  ...newGrant(),
  entitlementSlug: 'tokens',
  modifierType: 'ADD' as const,
  modifierValue: '50000',
  ...overrides,
});

describe('a percentage', () => {
  it.each([
    ['20', '20'],
    [' 20 ', '20'],
    ['12.5', '12.5'],
    ['12,5', '12.5'],
    ['100', '100'],
    ['0.01', '0.01'],
  ])('reads %j as %j', (typed, expected) => {
    expect(readPercentage(typed)).toBe(expected);
  });

  it.each(['', '0', '0.0', '101', '100.01', '-5', 'abc', '1e2', '20%', '1,2,3'])(
    'does not read %j: it is not above 0 and up to 100',
    (typed) => {
      expect(readPercentage(typed)).toBeNull();
    },
  );
});

describe('a fixed amount', () => {
  it('is typed in major units and sent in minor ones', () => {
    expect(readFixedAmount('50', 'USD')).toBe('5000');
    expect(readFixedAmount('50.5', 'USD')).toBe('5050');
    expect(readFixedAmount('500', 'JPY')).toBe('500');
    expect(readFixedAmount('0.75', 'USD')).toBe('75');
  });

  it.each(['', '0', '0.00', 'abc', '-5', '0.001'])(
    'does not read %j: it is not an amount above 0 with no finer a unit than the currency has',
    (typed) => {
      expect(readFixedAmount(typed, 'USD')).toBeNull();
    },
  );
});

describe('the value of a change to an entitlement', () => {
  it('accepts zero to set a limit, and above zero to add to it or multiply it', () => {
    expect(isModifierValue('SET', '0')).toBe(true);
    expect(isModifierValue('SET', '10')).toBe(true);
    expect(isModifierValue('ADD', '0')).toBe(false);
    expect(isModifierValue('ADD', '5')).toBe(true);
    expect(isModifierValue('MULTIPLY', '0')).toBe(false);
    expect(isModifierValue('MULTIPLY', '2.5')).toBe(true);
  });

  it('refuses a negative, a non-number and nothing, and asks nothing of lifting the limit', () => {
    for (const type of ['SET', 'ADD', 'MULTIPLY'] as const) {
      expect(isModifierValue(type, '-1')).toBe(false);
      expect(isModifierValue(type, 'lots')).toBe(false);
      expect(isModifierValue(type, '')).toBe(false);
    }
    expect(isModifierValue('UNLIMITED', '')).toBe(true);
  });
});

describe('the first step: what the voucher is called', () => {
  it('needs a name, which spaces are not', () => {
    expect(getStepErrors('type', values({ name: '' })).name).toBe(
      'Pages.Vouchers.Wizard.Errors.name',
    );
    expect(getStepErrors('type', values({ name: '   ' })).name).toBe(
      'Pages.Vouchers.Wizard.Errors.name',
    );
    expect(getStepErrors('type', values())).toEqual({});
  });

  it('keeps the name and the description within what the API takes', () => {
    expect(getStepErrors('type', values({ name: 'x'.repeat(201) })).name).toBe(
      'Pages.Vouchers.Wizard.Errors.nameTooLong',
    );
    expect(
      getStepErrors('type', values({ description: 'x'.repeat(2001) })).description,
    ).toBe('Pages.Vouchers.Wizard.Errors.descriptionTooLong');
    expect(getStepErrors('type', values({ name: 'x'.repeat(200) }))).toEqual({});
  });
});

describe('the second step: the offer of a discount', () => {
  it('needs a percentage above 0 and up to 100, and says so on the field', () => {
    for (const typed of ['', '0', '101']) {
      expect(getStepErrors('offer', values({ percentage: typed }))).toEqual({
        percentage: 'Pages.Vouchers.Wizard.Errors.percentage',
      });
    }
    expect(getStepErrors('offer', values({ percentage: '20' }))).toEqual({});
  });

  it('needs a currency and an amount for a fixed amount', () => {
    const fixed = { priceDiscountType: 'FIXED_AMOUNT' as const };

    expect(getStepErrors('offer', values({ ...fixed, amount: '50' }))).toEqual({
      currency: 'Pages.Vouchers.Wizard.Errors.currency',
    });
    expect(
      getStepErrors('offer', values({ ...fixed, amount: '', currency: 'USD' })),
    ).toEqual({ amount: 'Pages.Vouchers.Wizard.Errors.amount' });
    expect(
      getStepErrors('offer', values({ ...fixed, amount: '50', currency: 'USD' })),
    ).toEqual({});
  });

  it('does not ask a percentage of a fixed amount, nor an amount of a percentage', () => {
    expect(
      getStepErrors(
        'offer',
        values({
          amount: '',
          percentage: '20',
          priceDiscountType: 'PERCENTAGE',
        }),
      ),
    ).toEqual({});
    expect(
      getStepErrors(
        'offer',
        values({
          amount: '50',
          currency: 'USD',
          percentage: '',
          priceDiscountType: 'FIXED_AMOUNT',
        }),
      ),
    ).toEqual({});
  });

  it('needs at least one price when it applies to chosen prices, of a license or of an add-on', () => {
    const selected = { priceAppliesTo: 'SELECTED_PRICES' as const };

    expect(getStepErrors('offer', values(selected))).toEqual({
      applicableLicensePriceIds: 'Pages.Vouchers.Wizard.Errors.prices',
    });
    expect(
      getStepErrors('offer', values({ ...selected, applicableAddonPriceIds: ['p'] })),
    ).toEqual({});
    expect(
      getStepErrors('offer', values({ ...selected, applicableLicensePriceIds: ['p'] })),
    ).toEqual({});
  });

  it('needs a number of times from one when the offer repeats, and none otherwise', () => {
    const repeating = { duration: 'REPEATING' as const };

    for (const periods of [Number.NaN, 0, -1]) {
      expect(
        getStepErrors('offer', values({ ...repeating, durationInPeriods: periods })),
      ).toEqual({ durationInPeriods: 'Pages.Vouchers.Wizard.Errors.durationInPeriods' });
    }
    expect(
      getStepErrors('offer', values({ ...repeating, durationInPeriods: 12 })),
    ).toEqual({});
    expect(
      getStepErrors('offer', values({ duration: 'ONE_TIME', durationInPeriods: Number.NaN })),
    ).toEqual({});
  });

  it('refuses a number of times that is not a whole number or is more than the API takes', () => {
    const repeating = { duration: 'REPEATING' as const };

    expect(
      getStepErrors('offer', values({ ...repeating, durationInPeriods: 1.5 })),
    ).toEqual({ durationInPeriods: 'Pages.Vouchers.Wizard.Errors.durationInPeriods' });
    expect(
      getStepErrors('offer', values({ ...repeating, durationInPeriods: 2_147_483_648 })),
    ).toEqual({ durationInPeriods: 'Pages.Vouchers.Wizard.Errors.durationInPeriods' });
  });
});

describe('the second step: the offer of a boost', () => {
  const boost = { voucherType: 'ENTITLEMENT_BOOST' as const };

  it('needs at least one change', () => {
    expect(getStepErrors('offer', values({ ...boost, grants: [] }))).toEqual({
      grants: 'Pages.Vouchers.Wizard.Errors.grants',
    });
    expect(getStepErrors('offer', values({ ...boost, grants: [grant()] }))).toEqual({});
  });

  it('asks nothing of the discount, which a boost does not carry', () => {
    expect(
      getStepErrors(
        'offer',
        values({ ...boost, grants: [grant()], percentage: '', priceAppliesTo: 'SELECTED_PRICES' }),
      ),
    ).toEqual({});
  });

  it('needs the entitlement of each change, and each entitlement once, on the row that repeats it', () => {
    const errors = getStepErrors(
      'offer',
      values({
        ...boost,
        grants: [grant({ entitlementSlug: '' }), grant(), grant()],
      }),
    );

    expect(errors).toEqual({
      'grants[0].entitlementSlug': 'Pages.Vouchers.Wizard.Errors.entitlement',
      'grants[2].entitlementSlug': 'Pages.Vouchers.Wizard.Errors.duplicate',
    });
  });

  it('puts the error of a value on the row it is about, by the rule of its modifier', () => {
    const errors = getStepErrors(
      'offer',
      values({
        ...boost,
        grants: [
          grant({ entitlementSlug: 'a', modifierType: 'SET', modifierValue: '0' }),
          grant({ entitlementSlug: 'b', modifierType: 'ADD', modifierValue: '0' }),
          grant({ entitlementSlug: 'c', modifierType: 'MULTIPLY', modifierValue: '0' }),
          grant({ entitlementSlug: 'd', modifierType: 'SET', modifierValue: '-1' }),
          grant({ entitlementSlug: 'e', modifierType: 'UNLIMITED', modifierValue: '' }),
        ],
      }),
    );

    expect(errors).toEqual({
      'grants[1].modifierValue': 'Pages.Vouchers.Wizard.Errors.positiveValue',
      'grants[2].modifierValue': 'Pages.Vouchers.Wizard.Errors.positiveValue',
      'grants[3].modifierValue': 'Pages.Vouchers.Wizard.Errors.setValue',
    });
  });
});

describe('the third step: the code, the conditions and the limits', () => {
  it('leaves the code empty to have one generated, and takes 8 to 64 letters, digits, dashes and underscores', () => {
    expect(getStepErrors('eligibility', values({ code: '' }))).toEqual({});
    expect(getStepErrors('eligibility', values({ code: 'SPRING2027' }))).toEqual({});
    expect(getStepErrors('eligibility', values({ code: ' SPRING-2027_a ' }))).toEqual({});
    for (const code of ['SHORT', 'has space in', 'x'.repeat(65), 'accentué-2027']) {
      expect(getStepErrors('eligibility', values({ code }))).toEqual({
        code: 'Pages.Vouchers.Wizard.Errors.code',
      });
    }
  });

  it('needs a currency for a minimum, and a minimum that is an amount', () => {
    expect(
      getStepErrors('eligibility', values({ minimumAmount: '100' })),
    ).toEqual({ minimumCurrency: 'Pages.Vouchers.Wizard.Errors.currency' });
    expect(
      getStepErrors('eligibility', values({ minimumAmount: 'lots', minimumCurrency: 'USD' })),
    ).toEqual({ minimumAmount: 'Pages.Vouchers.Wizard.Errors.minimumAmount' });
    expect(
      getStepErrors('eligibility', values({ minimumAmount: '100', minimumCurrency: 'USD' })),
    ).toEqual({});
    // A currency alone is no minimum.
    expect(getStepErrors('eligibility', values({ minimumCurrency: 'USD' }))).toEqual({});
  });

  it('needs dates that are dates, and an end that is after the start', () => {
    expect(
      getStepErrors('eligibility', values({ expiresAt: 'tomorrow' })),
    ).toEqual({ expiresAt: 'Pages.Vouchers.Wizard.Errors.date' });
    expect(
      getStepErrors(
        'eligibility',
        values({ expiresAt: '2027-01-01T10:00', startsAt: '2027-01-01T10:00' }),
      ),
    ).toEqual({ expiresAt: 'Pages.Vouchers.Wizard.Errors.window' });
    expect(
      getStepErrors(
        'eligibility',
        values({ expiresAt: '2027-02-01T10:00', startsAt: '2027-01-01T10:00' }),
      ),
    ).toEqual({});
  });

  it('needs a maximum that is a whole number from one, or nothing', () => {
    for (const max of [0, -1, 2.5]) {
      expect(getStepErrors('eligibility', values({ maxRedemptions: max }))).toEqual({
        maxRedemptions: 'Pages.Vouchers.Wizard.Errors.maxRedemptions',
      });
    }
    expect(getStepErrors('eligibility', values({ maxRedemptions: Number.NaN }))).toEqual({});
    expect(getStepErrors('eligibility', values({ maxRedemptions: 100 }))).toEqual({});
  });
});

describe('the steps together', () => {
  it('is wrong in every step an empty voucher has something to fix in, and whole when it has none', () => {
    expect(getVoucherFormErrors(initialVoucherFormValues)).toEqual({
      name: 'Pages.Vouchers.Wizard.Errors.name',
      percentage: 'Pages.Vouchers.Wizard.Errors.percentage',
    });
    expect(getVoucherFormErrors(values())).toBeUndefined();
  });

  it('says whether a step has something to fix', () => {
    expect(isStepValid('type', initialVoucherFormValues)).toBe(false);
    expect(isStepValid('offer', initialVoucherFormValues)).toBe(false);
    expect(isStepValid('eligibility', initialVoucherFormValues)).toBe(true);
    expect(isStepValid('type', values())).toBe(true);
  });

  it('gives each row of changes a key of its own, so that taking one away does not hand its inputs to the next', () => {
    const [first, second] = [newGrant(), newGrant()];

    expect(first.key).not.toBe(second.key);
    expect(first).toMatchObject({ entitlementSlug: '', modifierType: 'ADD', modifierValue: '' });
  });
});
