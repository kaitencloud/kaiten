import { describe, expect, it } from 'vite-plus/test';
import type { Price } from '@/api-client';
import { buildPrice } from '../../../../../e2e/app/_support/fixtures';
import {
  canAddPrice,
  countUnvaluedPrices,
  getDefaultPrice,
  getFlatFees,
  getNextDisplayOrder,
  getPeriodSlots,
  getPriceDeprecation,
  getVersionCurrency,
  isActivePrice,
  isFlatFee,
} from '../addon-price.utils';

const flat = (overrides: Partial<Parameters<typeof buildPrice>[0]> & { id: string }): Price =>
  buildPrice({ billingPeriod: 'MONTHLY', unitAmountDecimal: '1000', ...overrides });
const metered = buildPrice({
  billingModel: 'USAGE_BASED',
  id: 'metered',
  metered: { entitlementSlug: 'api-calls', saleUnitFactor: '1' },
  unitAmountDecimal: '0.1',
});
const monthly = flat({ displayOrder: 1, id: 'monthly', isDefault: true });
const annual = flat({ billingPeriod: 'ANNUAL', displayOrder: 2, id: 'annual', isDefault: true });

describe('the prices of a version', () => {
  it('are flat fees to the console, which leaves out the metered ones the API keeps and never values', () => {
    expect(isFlatFee(monthly)).toBe(true);
    expect(isFlatFee(metered)).toBe(false);
    expect(getFlatFees([metered, monthly]).map(({ id }) => id)).toEqual(['monthly']);
    expect(countUnvaluedPrices([metered, monthly, { ...metered, id: 'overage' }])).toBe(2);
  });

  it('are active or deprecated', () => {
    expect(isActivePrice(monthly)).toBe(true);
    expect(isActivePrice({ ...monthly, status: 'DEPRECATED' })).toBe(false);
  });

  it('have the currency of the first one, whatever becomes of it', () => {
    expect(getVersionCurrency([flat({ currency: 'EUR', id: 'a', status: 'DEPRECATED' }), monthly])).toBe('EUR');
    expect(getVersionCurrency([])).toBeUndefined();
  });

  it('take the display order after the last, and leave the first to the API', () => {
    expect(getNextDisplayOrder([monthly, annual])).toBe(3);
    expect(getNextDisplayOrder([])).toBeUndefined();
  });

  it('may be added to a version that is not archived', () => {
    expect(canAddPrice({ lifecycleState: 'DRAFT' })).toBe(true);
    expect(canAddPrice({ lifecycleState: 'PUBLISHED' })).toBe(true);
    expect(canAddPrice({ lifecycleState: 'ARCHIVED' })).toBe(false);
  });
});

describe('the default price of a period', () => {
  it('is the active flat fee of the period that is flagged', () => {
    expect(getDefaultPrice([monthly, annual], 'ANNUAL')?.id).toBe('annual');
    expect(getDefaultPrice([monthly, annual], 'QUARTERLY')).toBeUndefined();
  });

  it('is never a deprecated price, a metered one, or one that is not flagged', () => {
    expect(getDefaultPrice([{ ...monthly, status: 'DEPRECATED' }], 'MONTHLY')).toBeUndefined();
    expect(getDefaultPrice([{ ...monthly, isDefault: false }], 'MONTHLY')).toBeUndefined();
    expect(getDefaultPrice([metered], undefined)).toBeUndefined();
  });
});

describe('the slots of the billing periods', () => {
  it('has a monthly and an annual one for a paid version, so that a missing annual price shows before an annual customer meets the refusal', () => {
    const slots = getPeriodSlots([monthly], 'PAID');

    expect(slots.map(({ period, status }) => [period, status])).toEqual([
      ['MONTHLY', 'default'],
      ['ANNUAL', 'missing'],
    ]);
    expect(slots[0]?.price?.id).toBe('monthly');
    expect(slots[1]?.price).toBeUndefined();
  });

  it('says a period that has active prices and none that is the default', () => {
    const slots = getPeriodSlots([{ ...monthly, isDefault: false }, annual], 'PAID');

    expect(slots.map(({ count, status }) => [count, status])).toEqual([
      [1, 'noDefault'],
      [1, 'default'],
    ]);
  });

  it('has a slot for a period it has a price for, besides the usual two', () => {
    const quarterly = flat({ billingPeriod: 'QUARTERLY', id: 'quarterly', isDefault: true });

    expect(getPeriodSlots([monthly, quarterly, annual], 'PAID').map(({ period }) => period)).toEqual([
      'MONTHLY',
      'QUARTERLY',
      'ANNUAL',
    ]);
  });

  it('has none for a version that is free or sold on request and has no price', () => {
    expect(getPeriodSlots([], 'FREE')).toEqual([]);
    expect(getPeriodSlots([], 'CUSTOM')).toEqual([]);
    // But one it has a price for says so.
    expect(getPeriodSlots([monthly], 'CUSTOM').map(({ period }) => period)).toEqual(['MONTHLY']);
  });

  it('counts only the active flat fees, a deprecated price being no price at all', () => {
    const slots = getPeriodSlots([{ ...monthly, status: 'DEPRECATED' }, metered], 'PAID');

    expect(slots.map(({ count, status }) => [count, status])).toEqual([
      [0, 'missing'],
      [0, 'missing'],
    ]);
  });
});

describe('deprecating a price', () => {
  it('is allowed for an active price that is not the default of its period', () => {
    expect(getPriceDeprecation({ isDefault: false, status: 'ACTIVE' })).toEqual({ allowed: true });
  });

  it('is refused for the default, which bills every instance holding the version', () => {
    expect(getPriceDeprecation({ isDefault: true, status: 'ACTIVE' })).toEqual({
      allowed: false,
      reason: 'default',
    });
  });

  it('is not offered for a price already deprecated', () => {
    expect(getPriceDeprecation({ isDefault: false, status: 'DEPRECATED' })).toBeUndefined();
  });
});
