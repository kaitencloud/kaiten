import { describe, expect, it, vi } from 'vite-plus/test';
import {
  DEFAULT_DATE_OPTIONS,
  DEFAULT_DATE_TIME_OPTIONS,
  formatDate,
  formatDateTime,
  formatNumber,
} from '../format-date';

vi.mock('i18next', () => ({
  default: { language: 'fr' },
}));

describe('formatDate', () => {
  it('formats with the i18next language, not the browser locale', () => {
    expect(formatDate('2026-06-11T10:00:00Z')).toBe(
      new Date('2026-06-11T10:00:00Z').toLocaleDateString(
        'fr',
        DEFAULT_DATE_OPTIONS,
      ),
    );
  });

  it('forwards Intl options', () => {
    expect(formatDate('2026-06-11T10:00:00Z', { dateStyle: 'long' })).toBe(
      new Date('2026-06-11T10:00:00Z').toLocaleDateString('fr', {
        dateStyle: 'long',
      }),
    );
  });

  it('returns the fallback for nullish or invalid input', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined, undefined, 'jamais')).toBe('jamais');
    expect(formatDate('not-a-date')).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('includes the time part', () => {
    expect(formatDateTime('2026-06-11T10:30:00Z')).toBe(
      new Date('2026-06-11T10:30:00Z').toLocaleString(
        'fr',
        DEFAULT_DATE_TIME_OPTIONS,
      ),
    );
  });
});

describe('formatNumber', () => {
  it('formats numbers with the app language', () => {
    expect(formatNumber(10000)).toBe((10000).toLocaleString('fr'));
  });
});
