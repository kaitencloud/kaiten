import { renderHook, waitFor } from '@testing-library/react';
import { afterAll, describe, expect, it } from 'vite-plus/test';
import {
  PRICING_SETTINGS_STORAGE_KEY,
  setLocalCreditValue,
  useLocalCreditValue,
} from '../pricing-local-settings';

// What a browser that used the rate card before already holds: the storage key
// and the shape of a record are kept, so that the value survives.
window.localStorage.setItem(
  PRICING_SETTINGS_STORAGE_KEY,
  JSON.stringify({
    's:pool:ai-credits': {
      versionKey: 'v1',
      data: { id: 'pool:ai-credits', creditValue: '0.01' },
    },
  }),
);

afterAll(() => window.localStorage.removeItem(PRICING_SETTINGS_STORAGE_KEY));

const stored = (): Record<string, { data?: { creditValue?: string } }> =>
  JSON.parse(window.localStorage.getItem(PRICING_SETTINGS_STORAGE_KEY) ?? '{}');

describe('the value of a credit kept in this browser', () => {
  it('is kept under the key the rate card has always written', () => {
    expect(PRICING_SETTINGS_STORAGE_KEY).toBe('kaiten:ai-pricing');
  });

  it('reads a value stored before, per pool', async () => {
    const pool = renderHook(() => useLocalCreditValue('ai-credits'));
    const other = renderHook(() => useLocalCreditValue('partner-ai-credits'));

    await waitFor(() => expect(pool.result.current).toBe('0.01'));
    expect(other.result.current).toBeNull();
  });

  it('follows what the rate card writes, in the same record shape', async () => {
    const pool = renderHook(() => useLocalCreditValue('ai-credits'));

    setLocalCreditValue('ai-credits', ' 0.02 ');

    await waitFor(() => expect(pool.result.current).toBe('0.02'));
    expect(stored()['s:pool:ai-credits']?.data?.creditValue).toBe('0.02');
  });

  it('reads a value the margin cannot be computed with as none', async () => {
    const pool = renderHook(() => useLocalCreditValue('ai-credits'));

    setLocalCreditValue('ai-credits', '0');
    await waitFor(() => expect(pool.result.current).toBeNull());

    setLocalCreditValue('ai-credits', 'ten cents');
    await waitFor(() =>
      expect(stored()['s:pool:ai-credits']?.data?.creditValue).toBe(
        'ten cents',
      ),
    );
    expect(pool.result.current).toBeNull();
  });
});
