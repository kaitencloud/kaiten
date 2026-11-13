import { describe, expect, it } from 'vite-plus/test';
import { presetRates, previewCredits, previewVendorCost, maximumBelowMinimum } from '../pricing-preview';
import { ruleFormSchema } from '../rule-form';

describe('AI rule editor preview', () => {
  it('prices disjoint cached input, cache-write and duration exactly', () => {
    expect(previewCredits({ perInputToken: '0.1', perOutputToken: '0.2', perSecond: '0.5' }, { inputTokens: 2, cacheReadInputTokens: 3, cacheWriteInputTokens: 1, outputTokens: 1, durationMs: 500 })).toBe('1.050000');
  });
  it('honors explicit zero cache rates, min/max, and half-up six-decimal rounding', () => {
    expect(previewCredits({ perInputToken: '1', perCachedInputToken: '0' }, { cacheReadInputTokens: 200 })).toBe('0.000000');
    expect(previewCredits({ perRequest: '0.0000005' }, {})).toBe('0.000001');
    expect(previewCredits({ perRequest: '2' }, {}, '3', '4')).toBe('3.000000');
    expect(previewCredits({ perRequest: '9' }, {}, '3', '4')).toBe('4.000000');
    expect(previewVendorCost({ currency: 'USD', perUnit: '0.02' }, { units: '2.5' })).toBe('0.050000');
  });
  it('presets clear stale dimensions and total-token prices cache-write too', () => {
    expect(presetRates('PER_TOTAL_TOKEN')).toMatchObject({ perInputToken: '1', perCachedInputToken: '1', perCacheWriteToken: '1', perOutputToken: '1', perUnit: null, perSecond: null });
  });
  it('requires a vector rate and valid guards without inventing conversion types', () => {
    const identity = { entitlementSlug: 'credits', modelSlug: 'ANY', requestType: 'ANY', chargeOnError: 'NEVER', minimumCreditsPerRequest: '0' };
    expect(ruleFormSchema.safeParse({ ...identity, rates: {} }).success).toBe(false);
    expect(ruleFormSchema.safeParse({ ...identity, rates: { perRequest: '0' } }).success).toBe(true);
    expect(ruleFormSchema.safeParse({ ...identity, rates: { perRequest: '-1' } }).success).toBe(false);
    expect(ruleFormSchema.safeParse({ ...identity, rates: { perRequest: '1' }, minimumCreditsPerRequest: '2', maximumCreditsPerRequest: '1' }).success).toBe(false);
  });
});

it('compares guards without losing sub-micro differences on large values', () => {
  expect(maximumBelowMinimum('999999999999.000002', '999999999999.000001')).toBe(true);
});
