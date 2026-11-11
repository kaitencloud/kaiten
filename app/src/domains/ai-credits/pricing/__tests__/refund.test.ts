import { describe, expect, it } from 'vite-plus/test';

import {
  normalizeRefundAmount,
  refundAmountIssue,
  refundableCredits,
  subtractDecimals,
  vendorCostDrift,
} from '../refund';

describe('refundableCredits', () => {
  it('is what was charged when nothing was refunded', () => {
    expect(refundableCredits({ charged: '78.5' })).toBe('78.5');
  });

  it('is charged minus refunded, exactly', () => {
    expect(refundableCredits({ charged: '78.5', refunded: '30' })).toBe('48.5');
    expect(refundableCredits({ charged: '0.3', refunded: '0.1' })).toBe('0.2');
    expect(refundableCredits({ charged: '1.380000', refunded: '1.38' })).toBe('0');
  });

  it('is zero for a call that was charged nothing, or has no amount', () => {
    expect(refundableCredits({ charged: '0' })).toBe('0');
    expect(refundableCredits({})).toBe('0');
  });

  it('never goes below zero', () => {
    expect(refundableCredits({ charged: '1', refunded: '2' })).toBe('0');
  });
});

describe('refundAmountIssue', () => {
  it('accepts a positive amount up to what is left, the whole of it included', () => {
    expect(refundAmountIssue('3.5', '48.5')).toBeNull();
    expect(refundAmountIssue('48.5', '48.5')).toBeNull();
    expect(refundAmountIssue('48.500000', '48.5')).toBeNull();
    expect(refundAmountIssue('0.000001', '48.5')).toBeNull();
  });

  it('refuses more than what is left', () => {
    expect(refundAmountIssue('48.500001', '48.5')).toBe('EXCEEDS');
    expect(refundAmountIssue('1', '0')).toBe('EXCEEDS');
  });

  it.each(['', '0', '-1', 'abc', '1e3', '1,5', '0.0000001', ' 1'])(
    'refuses %j: not a positive decimal of at most six decimals',
    (amount) => {
      expect(refundAmountIssue(amount, '48.5')).toBe('INVALID');
    },
  );
});

describe('normalizeRefundAmount', () => {
  it('writes the amount canonically, as the API counts its digits', () => {
    expect(normalizeRefundAmount('1.5000000')).toBe('1.5');
    expect(normalizeRefundAmount('08.50')).toBe('8.5');
    expect(normalizeRefundAmount('123456789012.123456')).toBe('123456789012.123456');
  });

  it.each(['1234567890123', '0.1234567', '-1', '1.', '.5', 'abc'])('is null for %j, which the API refuses', (amount) => {
    expect(normalizeRefundAmount(amount)).toBeNull();
  });
});

describe('vendorCostDrift', () => {
  it('is reported minus computed when both are stored and differ', () => {
    expect(vendorCostDrift('0.0118', '0.01035')).toBe('0.00145');
    expect(vendorCostDrift('0.009', '0.01035')).toBe('-0.00135');
  });

  it('is null when they agree or one is missing', () => {
    expect(vendorCostDrift('0.0095', '0.009500')).toBeNull();
    expect(vendorCostDrift(undefined, '0.01')).toBeNull();
    expect(vendorCostDrift('0.01', null)).toBeNull();
  });
});

describe('subtractDecimals', () => {
  it('subtracts exactly and refuses what is not a decimal', () => {
    expect(subtractDecimals('2.15', '1.38')).toBe('0.77');
    expect(subtractDecimals('x', '1')).toBeNull();
  });
});
