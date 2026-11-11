import { describe, expect, it, vi } from 'vite-plus/test';
import type { EntitlementUsage } from '@/api-client';
import { formatCredits } from '../format';
import { creditBalance } from '../pool-balance';

vi.mock('i18next', () => ({ default: { language: 'en' } }));

function usage(value: number, limit: number, reserved = '0', percent = 0): EntitlementUsage {
  return { entitlementId: 'pool', entitlementSlug: 'credits', licenseId: 'license', licenseSlug: 'pro', source: 'addon',
    value: { type: 'number', value }, limit: { type: 'number', value: limit }, reserved, limitCapExceededOveragePercent: percent };
}

describe('AI credit availability', () => {
  it('uses effective overage and open reservations, not just included credits', () => {
    expect(creditBalance(usage(4, 10, '2', 20))).toMatchObject({ maximum: 12, available: 6, consumed: 4, reserved: 2 });
  });
  it('keeps unlimited allowances unbounded', () => {
    expect(creditBalance(usage(4, -1, '2'))).toMatchObject({ maximum: null, available: null, consumedPercent: 0, reservedPercent: 0 });
    expect(creditBalance(usage(4, 10, '2', -1)).maximum).toBeNull();
  });
  it('shows a negative available balance instead of hiding overdrawn usage', () => {
    expect(creditBalance(usage(12, 10))).toMatchObject({ available: -2, consumedPercent: 100 });
  });
  it('draws no fabricated progress at zero, including a zero allowance', () => {
    expect(creditBalance(usage(0, 10))).toMatchObject({ consumedPercent: 0, reservedPercent: 0 });
    expect(creditBalance(usage(0, 0))).toMatchObject({ available: 0, consumedPercent: 0, reservedPercent: 0 });
  });
});

describe('near the limit', () => {
  it('uses the entitlement’s own warning threshold, on consumption', () => {
    expect(creditBalance(usage(86, 100), 90)).toMatchObject({ state: 'OK', warningBoundary: 90 });
    expect(creditBalance(usage(90, 100), 90).state).toBe('NEAR_LIMIT');
    expect(creditBalance(usage(50, 100), 50).state).toBe('NEAR_LIMIT');
    // Open holds are not consumption: the API's warning does not count them.
    expect(creditBalance(usage(80, 100, '15'), 90).state).toBe('OK');
  });

  it('is off without a threshold: 0, blank, or no included limit', () => {
    expect(creditBalance(usage(99, 100)).state).toBe('OK');
    expect(creditBalance(usage(99, 100), 0)).toMatchObject({ state: 'OK', warningBoundary: null });
    expect(creditBalance(usage(99, 100), null).state).toBe('OK');
    expect(creditBalance(usage(99, -1), 80)).toMatchObject({ state: 'UNLIMITED', warningBoundary: null });
  });

  it('gives way to overage and overdraft', () => {
    expect(creditBalance(usage(105, 100, '0', 10), 80).state).toBe('IN_OVERAGE');
    expect(creditBalance(usage(120, 100, '0', 10), 80).state).toBe('OVERDRAWN');
  });
});

describe('visible credit precision', () => {
  it.each([0, -0, '0', '-0', '0.000000'])(
    'shows true zero (%s) without a negative sign',
    (value) => expect(formatCredits(value)).toBe('0.00'),
  );

  it.each([
    [0.001, '0.001'],
    ['0.000001', '0.000001'],
    [-0.001, '-0.001'],
    ['-0.000001', '-0.000001'],
    [0.01, '0.01'],
    [1, '1.00'],
    ['1.230000', '1.23'],
    ['1.234567', '1.234567'],
    [1.2345678, '1.234568'],
    ['1234567890.123456', '1,234,567,890.123456'],
  ])('formats %s adaptively up to the six-place credit quantum', (value, expected) => {
    expect(formatCredits(value)).toBe(expected);
  });

  it('keeps absent amounts distinct from zero', () => {
    expect(formatCredits()).toBe('—');
    expect(formatCredits(null)).toBe('—');
  });

  it('retains precision for consumed, reserved and available credits without changing balance arithmetic', () => {
    const balance = creditBalance(usage(0.001, 1, '0.000001'));
    expect(formatCredits(balance.consumed)).toBe('0.001');
    expect(formatCredits(balance.reserved)).toBe('0.000001');
    expect(formatCredits(balance.available)).toBe('0.998999');
  });

  it('shows a small overdrawn balance rather than negative zero', () => {
    expect(formatCredits(creditBalance(usage(1.000001, 1)).available)).toBe('-0.000001');
  });
});
