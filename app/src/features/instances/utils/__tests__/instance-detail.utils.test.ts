import { describe, expect, it } from 'vite-plus/test';
import {
  formatTimeUntil,
  getDaysUntil,
  getLicenseProgressPercent,
  getLicenseUrgencyVariant,
} from '../instance-detail.utils';

describe('instance detail utils', () => {
  it('computes days until date', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    expect(getDaysUntil('2025-01-11T00:00:00.000Z', now)).toBe(10);
  });

  it('returns urgency variant from days left', () => {
    expect(getLicenseUrgencyVariant(10)).toBe('destructive');
    expect(getLicenseUrgencyVariant(60)).toBe('secondary');
    expect(getLicenseUrgencyVariant(120)).toBe('success');
  });

  it('returns progress percentage clamped to [0, 100]', () => {
    const start = '2025-01-01T00:00:00.000Z';
    const end = '2025-01-11T00:00:00.000Z';

    expect(
      getLicenseProgressPercent(
        start,
        end,
        new Date('2025-01-06T00:00:00.000Z'),
      ),
    ).toBe(50);
    expect(
      getLicenseProgressPercent(
        start,
        end,
        new Date('2024-12-30T00:00:00.000Z'),
      ),
    ).toBe(0);
    expect(
      getLicenseProgressPercent(
        start,
        end,
        new Date('2025-02-01T00:00:00.000Z'),
      ),
    ).toBe(100);
  });

  it('says how far off a date is in the unit a person would use', () => {
    expect(formatTimeUntil(1, 'en')).toBe('tomorrow');
    expect(formatTimeUntil(45, 'en')).toBe('in 45 days');
    expect(formatTimeUntil(210, 'en')).toBe('in 7 months');
    expect(formatTimeUntil(3653, 'en')).toBe('in 10 years');
    expect(formatTimeUntil(3653, 'fr')).toBe('dans 10 ans');
  });
});
