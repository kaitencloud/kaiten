import { describe, expect, it } from 'vite-plus/test';
import type { License } from '@/api-client';
import { buildPrice } from '../../../../../e2e/app/_support/fixtures';
import { canDeprecatePrice, canEditPrice, getDefaultPrice, getNextDisplayOrder, getPriceRules, getVersionCurrency } from '../license-price.utils';

describe('what a version lets be done to its prices', () => {
  const rulesOf = (lifecycleState: License['lifecycleState']) =>
    getPriceRules({ lifecycleState });
  const active = buildPrice({ id: 'a', unitAmountDecimal: '100' });
  const retired = buildPrice({ id: 'd', status: 'DEPRECATED', unitAmountDecimal: '100' });

  it('edits the prices of a draft, and nothing else', () => {
    expect(rulesOf('DRAFT')).toMatchObject({ canAdd: true, canEdit: true });
    expect(rulesOf('PUBLISHED')).toMatchObject({ canAdd: true, canEdit: false });
    expect(rulesOf('ARCHIVED')).toMatchObject({ canAdd: false, canEdit: false });
    // A version with no state reads as published.
    expect(rulesOf(undefined)).toMatchObject({ canEdit: false, state: 'PUBLISHED' });
  });

  it('never edits a deprecated price, and deprecates only an active one', () => {
    expect(canEditPrice(rulesOf('DRAFT'), active)).toBe(true);
    expect(canEditPrice(rulesOf('DRAFT'), retired)).toBe(false);
    expect(canEditPrice(rulesOf('PUBLISHED'), active)).toBe(false);
    expect(canDeprecatePrice(active)).toBe(true);
    expect(canDeprecatePrice(retired)).toBe(false);
  });
});

describe('the prices of a version', () => {
  const base = buildPrice({
    currency: 'EUR',
    displayOrder: 1,
    id: 'p1',
    isDefault: true,
    unitAmountDecimal: '2900',
  });
  const annual = buildPrice({
    billingPeriod: 'ANNUAL',
    currency: 'EUR',
    displayOrder: 4,
    id: 'p2',
    unitAmountDecimal: '29000',
  });

  it('bill in the currency of the first of them, a deprecated one included', () => {
    expect(getVersionCurrency([])).toBeUndefined();
    expect(
      getVersionCurrency([{ ...base, status: 'DEPRECATED' as const, isDefault: false }]),
    ).toBe('EUR');
  });

  it('give a new one the next display order, and leave the first to the API', () => {
    expect(getNextDisplayOrder([])).toBeUndefined();
    expect(getNextDisplayOrder([base, annual])).toBe(5);
  });

  it('have one default per period, and only an active price is one', () => {
    expect(getDefaultPrice([base, annual], 'MONTHLY')?.id).toBe('p1');
    expect(getDefaultPrice([base, annual], 'ANNUAL')).toBeUndefined();
    expect(
      getDefaultPrice([{ ...base, status: 'DEPRECATED' as const }], 'MONTHLY'),
    ).toBeUndefined();
  });
});
