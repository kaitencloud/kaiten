import { describe, expect, it } from 'vite-plus/test';
import {
  CHECKOUT_SESSION_STATUS_LABEL_KEYS,
  CHECKOUT_SESSION_STATUSES,
  getPeriodLabelKey,
  isExpiredWithRecords,
} from '../checkout-session';

describe('the statuses of a checkout', () => {
  it('have a label each, in the order of the life of a checkout', () => {
    expect(CHECKOUT_SESSION_STATUSES).toEqual([
      'OPEN',
      'AWAITING_PAYMENT',
      'COMPLETED',
      'ABANDONED',
      'EXPIRED',
    ]);
    expect(Object.keys(CHECKOUT_SESSION_STATUS_LABEL_KEYS).sort()).toEqual(
      [...CHECKOUT_SESSION_STATUSES].sort(),
    );
  });
});

describe('isExpiredWithRecords', () => {
  it('is true for an expired checkout whose completion ran, and for no other', () => {
    expect(
      isExpiredWithRecords({ customerSlug: 'acme', status: 'EXPIRED' }),
    ).toBe(true);
    expect(
      isExpiredWithRecords({ customerSlug: null, status: 'EXPIRED' }),
    ).toBe(false);
    expect(
      isExpiredWithRecords({ customerSlug: 'acme', status: 'COMPLETED' }),
    ).toBe(false);
    expect(
      isExpiredWithRecords({ customerSlug: 'acme', status: 'ABANDONED' }),
    ).toBe(false);
  });
});

describe('getPeriodLabelKey', () => {
  it('names the periods of billing', () => {
    expect(getPeriodLabelKey('MONTHLY')).toBe(
      'Features.Billing.Price.Periods.MONTHLY',
    );
    expect(getPeriodLabelKey('ANNUAL')).toBe(
      'Features.Billing.Price.Periods.ANNUAL',
    );
  });

  it('has none for a period this version does not know, which reads as it was sent', () => {
    expect(getPeriodLabelKey('BIENNIAL')).toBeUndefined();
    expect(getPeriodLabelKey('')).toBeUndefined();
  });
});
