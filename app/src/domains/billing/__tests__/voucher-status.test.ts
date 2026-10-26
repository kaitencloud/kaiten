import { describe, expect, it } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import {
  getRedemptionStatus,
  getRedemptionStatusLabelKey,
  getVoucherStatusLabelKey,
  getVoucherTypeLabelKey,
  isVoucherScheduled,
  VOUCHER_STATUSES,
  VOUCHER_TYPES,
} from '../logic';

const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const PAST = '2026-06-30T23:59:59.000Z';
const FUTURE = '2027-06-30T23:59:59.000Z';

const read = (locale: unknown, key: string) =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      locale,
    );

// The API stores the state of a voucher: it sets EXPIRED once the end has passed and EXHAUSTED
// with the redemption that reaches the maximum, so nothing is derived from the window or the count.
describe('the state of a voucher', () => {
  it('says that a voucher whose window opens later is scheduled', () => {
    expect(isVoucherScheduled({ startsAt: FUTURE }, NOW)).toBe(true);
    expect(isVoucherScheduled({ startsAt: PAST }, NOW)).toBe(false);
    expect(isVoucherScheduled({ startsAt: null }, NOW)).toBe(false);
    expect(isVoucherScheduled({ startsAt: null } as never, NOW)).toBe(false);
  });
});

describe('the state of a redemption', () => {
  it('reads a boost whose window closed as expired, though the API keeps it ACTIVE', () => {
    expect(
      getRedemptionStatus({ effectiveExpiresAt: PAST, status: 'ACTIVE' }, NOW),
    ).toBe('EXPIRED');
    expect(
      getRedemptionStatus({ effectiveExpiresAt: FUTURE, status: 'ACTIVE' }, NOW),
    ).toBe('ACTIVE');
  });

  it('keeps a redemption with no end, and one the API ended, as it is', () => {
    expect(getRedemptionStatus({ effectiveExpiresAt: null, status: 'ACTIVE' }, NOW)).toBe('ACTIVE');
    expect(
      getRedemptionStatus({ effectiveExpiresAt: FUTURE, status: 'REVOKED' }, NOW),
    ).toBe('REVOKED');
    expect(
      getRedemptionStatus({ effectiveExpiresAt: PAST, status: 'REVOKED' }, NOW),
    ).toBe('REVOKED');
    expect(getRedemptionStatus({ effectiveExpiresAt: null, status: 'EXPIRED' }, NOW)).toBe('EXPIRED');
  });
});

describe('the words of a voucher', () => {
  it('has a word for each state and kind, in English and in French', () => {
    const keys = [
      ...VOUCHER_STATUSES.map(getVoucherStatusLabelKey),
      ...VOUCHER_TYPES.map(getVoucherTypeLabelKey),
      ...(['ACTIVE', 'EXPIRED', 'REVOKED'] as const).map(
        getRedemptionStatusLabelKey,
      ),
    ];

    // V32-03 (c, d) adds FLAG_GRANT and COMPOSITE to V1: five voucher states,
    // four kinds and three redemption states must all have words in both locales.
    expect(VOUCHER_TYPES).toEqual([
      'PRICE',
      'ENTITLEMENT_BOOST',
      'FLAG_GRANT',
      'COMPOSITE',
    ]);
    expect(keys).toHaveLength(12);
    for (const key of keys) {
      expect(read(en, key), key).toEqual(expect.any(String));
      expect(read(fr, key), key).toEqual(expect.any(String));
    }
  });
});
