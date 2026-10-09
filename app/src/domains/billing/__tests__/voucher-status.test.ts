import { describe, expect, it } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import {
  getRedemptionStatus,
  getRedemptionStatusLabelKey,
  getVoucherStatus,
  getVoucherStatusLabelKey,
  getVoucherTypeLabelKey,
  isVoucherScheduled,
  VOUCHER_STATUSES,
  VOUCHER_TYPES,
} from '../logic';

const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const PAST = '2026-06-30T23:59:59.000Z';
const FUTURE = '2027-06-30T23:59:59.000Z';

const voucher = (
  overrides: Partial<Parameters<typeof getVoucherStatus>[0]> = {},
) => ({
  expiresAt: undefined,
  maxRedemptions: undefined,
  redemptionsCount: 0,
  status: 'ACTIVE' as const,
  ...overrides,
});

const read = (locale: unknown, key: string) =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      locale,
    );

// The API never sets a voucher EXPIRED, and an ACTIVE voucher stays ACTIVE past its end until
// the redemption that reaches its maximum flips it to EXHAUSTED: what a person wants to know is
// read from the window and the count.
describe('the state of a voucher', () => {
  it.each(['DRAFT', 'ARCHIVED', 'EXPIRED', 'EXHAUSTED'] as const)(
    'keeps the %s the API stored, whatever the window and the count say',
    (status) => {
      expect(
        getVoucherStatus(
          voucher({
            expiresAt: PAST,
            maxRedemptions: 1,
            redemptionsCount: 5,
            status,
          }),
          NOW,
        ),
      ).toBe(status);
    },
  );

  it('reads an ACTIVE voucher as fully redeemed once its count reached its maximum', () => {
    expect(
      getVoucherStatus(voucher({ maxRedemptions: 2, redemptionsCount: 2 }), NOW),
    ).toBe('EXHAUSTED');
    expect(
      getVoucherStatus(voucher({ maxRedemptions: 2, redemptionsCount: 9 }), NOW),
    ).toBe('EXHAUSTED');
  });

  it('tests the count before the window, as the API does when a code is redeemed', () => {
    expect(
      getVoucherStatus(
        voucher({ expiresAt: PAST, maxRedemptions: 1, redemptionsCount: 1 }),
        NOW,
      ),
    ).toBe('EXHAUSTED');
  });

  it('reads an ACTIVE voucher as expired when its end is not after now', () => {
    expect(getVoucherStatus(voucher({ expiresAt: PAST }), NOW)).toBe('EXPIRED');
    expect(
      getVoucherStatus(voucher({ expiresAt: '2026-10-07T12:00:00.000Z' }), NOW),
    ).toBe('EXPIRED');
    expect(
      getVoucherStatus(voucher({ expiresAt: '2026-10-07T12:00:00.001Z' }), NOW),
    ).toBe('ACTIVE');
  });

  it('keeps a voucher with room and time active, and one with no limit whatever its count', () => {
    expect(
      getVoucherStatus(
        voucher({ expiresAt: FUTURE, maxRedemptions: 3, redemptionsCount: 2 }),
        NOW,
      ),
    ).toBe('ACTIVE');
    expect(getVoucherStatus(voucher({ redemptionsCount: 100_000 }), NOW)).toBe(
      'ACTIVE',
    );
  });

  it('judges from a date as well as from a time, and from now when none is given', () => {
    expect(getVoucherStatus(voucher({ expiresAt: PAST }), new Date(NOW))).toBe(
      'EXPIRED',
    );
    expect(getVoucherStatus(voucher({ expiresAt: PAST }))).toBe('EXPIRED');
    expect(getVoucherStatus(voucher({ expiresAt: '2999-01-01T00:00:00Z' }))).toBe(
      'ACTIVE',
    );
  });

  it('says that a voucher whose window opens later is scheduled', () => {
    expect(isVoucherScheduled({ startsAt: FUTURE }, NOW)).toBe(true);
    expect(isVoucherScheduled({ startsAt: PAST }, NOW)).toBe(false);
    expect(isVoucherScheduled({ startsAt: undefined }, NOW)).toBe(false);
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
    expect(getRedemptionStatus({ status: 'ACTIVE' }, NOW)).toBe('ACTIVE');
    expect(
      getRedemptionStatus({ effectiveExpiresAt: FUTURE, status: 'REVOKED' }, NOW),
    ).toBe('REVOKED');
    expect(
      getRedemptionStatus({ effectiveExpiresAt: PAST, status: 'REVOKED' }, NOW),
    ).toBe('REVOKED');
    expect(getRedemptionStatus({ status: 'EXPIRED' }, NOW)).toBe('EXPIRED');
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

    expect(keys).toHaveLength(10);
    for (const key of keys) {
      expect(read(en, key), key).toEqual(expect.any(String));
      expect(read(fr, key), key).toEqual(expect.any(String));
    }
  });
});
