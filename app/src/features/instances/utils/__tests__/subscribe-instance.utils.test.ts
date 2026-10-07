import { describe, expect, it } from 'vite-plus/test';
import type { Price } from '@/api-client';
import {
  getBasePriceOptions,
  getDefaultBasePrice,
  getSubscribeBlock,
} from '../subscribe-instance.utils';

const price = (id: string, overrides: Partial<Price> = {}): Price =>
  ({
    billingModel: 'FLAT_FEE',
    billingPeriod: 'MONTHLY',
    billingTiming: 'ADVANCE',
    currency: 'USD',
    displayOrder: 0,
    id,
    isDefault: false,
    status: 'ACTIVE',
    unitAmountDecimal: '2900',
    ...overrides,
  }) as Price;

describe('getBasePriceOptions', () => {
  it('offers only the active flat fees: a subscription is pinned to one', () => {
    const options = getBasePriceOptions([
      price('monthly'),
      price('usage', { billingModel: 'USAGE_BASED' }),
      price('overage', { billingModel: 'OVERAGE' }),
      price('retired', { status: 'DEPRECATED' }),
      price('annual', { billingPeriod: 'ANNUAL' }),
    ]);

    expect(options.map((option) => option.id)).toEqual(['annual', 'monthly'].sort());
  });

  it('puts the default first, then the order the version shows them in, then by id', () => {
    const options = getBasePriceOptions([
      price('b', { displayOrder: 2 }),
      price('c', { displayOrder: 1 }),
      price('a', { displayOrder: 1 }),
      price('d', { displayOrder: 5, isDefault: true }),
    ]);

    expect(options.map((option) => option.id)).toEqual(['d', 'a', 'c', 'b']);
  });

  it('does not reorder what it was given', () => {
    const given = [price('b', { displayOrder: 2 }), price('a', { displayOrder: 1 })];

    getBasePriceOptions(given);

    expect(given.map((option) => option.id)).toEqual(['b', 'a']);
  });

  it('offers nothing for a version with no flat fee', () => {
    expect(getBasePriceOptions([price('usage', { billingModel: 'USAGE_BASED' })])).toEqual([]);
    expect(getBasePriceOptions([])).toEqual([]);
  });
});

describe('getDefaultBasePrice', () => {
  it('is the default price, else the first', () => {
    expect(getDefaultBasePrice([price('a'), price('b', { isDefault: true })])?.id).toBe('b');
    expect(getDefaultBasePrice([price('a'), price('b')])?.id).toBe('a');
    expect(getDefaultBasePrice([])).toBeUndefined();
  });
});

describe('getSubscribeBlock', () => {
  it('lets a published version, and one with no state, be subscribed to', () => {
    expect(getSubscribeBlock({ lifecycleState: 'PUBLISHED' })).toBeUndefined();
    expect(getSubscribeBlock({ lifecycleState: undefined })).toBeUndefined();
    expect(getSubscribeBlock(null)).toBeUndefined();
    expect(getSubscribeBlock(undefined)).toBeUndefined();
  });

  it('blocks a draft, which is not on sale, and a withdrawn version', () => {
    expect(getSubscribeBlock({ lifecycleState: 'DRAFT' })).toBe('license-not-published');
    expect(getSubscribeBlock({ lifecycleState: 'ARCHIVED' })).toBe('license-not-published');
  });
});
