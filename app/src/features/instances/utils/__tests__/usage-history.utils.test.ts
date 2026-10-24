import { describe, expect, it } from 'vite-plus/test';
import {
  ceilToUtcDay,
  findHistoryRow,
  isPeriodTooLongToExport,
  MAX_EXPORT_DAYS,
} from '../usage-history.utils';

const NOW = Date.parse('2027-03-15T12:00:00.000Z');

describe('isPeriodTooLongToExport', () => {
  it('is never too long with no start: the API reads 30 days before the end', () => {
    expect(isPeriodTooLongToExport({}, NOW)).toBe(false);
    expect(isPeriodTooLongToExport({ to: '2027-03-01T00:00:00.000Z' }, NOW)).toBe(
      false,
    );
  });

  it('counts an open end as now', () => {
    expect(
      isPeriodTooLongToExport({ from: '2026-03-15T12:00:00.000Z' }, NOW),
    ).toBe(false);
    expect(
      isPeriodTooLongToExport({ from: '2026-03-14T00:00:00.000Z' }, NOW),
    ).toBe(true);
  });

  it('allows 366 days to the millisecond and refuses one more', () => {
    const from = '2026-01-01T00:00:00.000Z';
    const limit = Date.parse(from) + MAX_EXPORT_DAYS * 24 * 60 * 60 * 1000;

    expect(
      isPeriodTooLongToExport({ from, to: new Date(limit).toISOString() }, NOW),
    ).toBe(false);
    expect(
      isPeriodTooLongToExport(
        { from, to: new Date(limit + 1).toISOString() },
        NOW,
      ),
    ).toBe(true);
  });
});

describe('ceilToUtcDay', () => {
  it('keeps a midnight and moves any other instant to the next one', () => {
    expect(ceilToUtcDay('2025-04-16T00:00:00.000Z')).toBe(
      '2025-04-16T00:00:00.000Z',
    );
    expect(ceilToUtcDay('2025-04-15T22:14:07.000Z')).toBe(
      '2025-04-16T00:00:00.000Z',
    );
    expect(ceilToUtcDay('2025-04-15T00:00:00.001Z')).toBe(
      '2025-04-16T00:00:00.000Z',
    );
  });
});

describe('findHistoryRow', () => {
  const rows = [
    { entitlementName: 'API calls', entitlementSlug: 'api-calls', entitlementType: 'NUMBER' },
    { entitlementName: 'SSO', entitlementSlug: 'sso', entitlementType: 'BOOLEAN' },
    { entitlementName: 'Region', entitlementSlug: 'region', entitlementType: 'CONFIG' },
    { entitlementName: 'No slug', entitlementSlug: null, entitlementType: 'NUMBER' },
  ];

  it('finds the counter a link names', () => {
    expect(findHistoryRow(rows, 'api-calls')?.entitlementName).toBe('API calls');
  });

  it('opens nothing for a flag, a configuration, an entitlement the instance lacks, or no slug', () => {
    expect(findHistoryRow(rows, 'sso')).toBeUndefined();
    expect(findHistoryRow(rows, 'region')).toBeUndefined();
    expect(findHistoryRow(rows, 'seats')).toBeUndefined();
    expect(findHistoryRow(rows, undefined)).toBeUndefined();
    expect(findHistoryRow(rows, '')).toBeUndefined();
  });
});
