import { afterEach, describe, expect, it } from 'vite-plus/test';
import {
  formatInstant,
  formatServicePeriod,
  formatUtcDate,
  formatUtcTime,
  splitUtcMarker,
} from '../logic';

// Intl writes a thin space around the dash of a range and a no-break space
// before the time of day; the tests read both as plain spaces.
const plain = (text: string) => text.replace(/[   ]/g, ' ');

const originalZone = process.env.TZ;
afterEach(() => {
  if (originalZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalZone;
  }
});

describe('formatServicePeriod', () => {
  it('writes the boundaries in UTC, half-open, with the marker', () => {
    expect(
      plain(
        formatServicePeriod('2027-03-01T00:00:00.000Z', '2027-04-01T00:00:00.000Z', 'en'),
      ),
    ).toBe('Mar 1 – Apr 1, 2027 (UTC)');
  });

  it('ends on the instant that closes the period, never on the last day it covers', () => {
    expect(
      formatServicePeriod('2027-03-01T00:00:00.000Z', '2027-04-01T00:00:00.000Z', 'en'),
    ).not.toContain('Mar 31');
  });

  it.each(['Europe/Paris', 'America/Los_Angeles', 'Pacific/Auckland', 'UTC'])(
    'reads the same from %s',
    (zone) => {
      process.env.TZ = zone;

      expect(
        plain(
          formatServicePeriod('2027-03-01T00:00:00.000Z', '2027-04-01T00:00:00.000Z', 'en'),
        ),
      ).toBe('Mar 1 – Apr 1, 2027 (UTC)');
    },
  );

  it('follows the language', () => {
    expect(
      plain(
        formatServicePeriod('2027-03-01T00:00:00.000Z', '2027-04-01T00:00:00.000Z', 'fr'),
      ),
    ).toBe('1 mars – 1 avr. 2027 (UTC)');
  });

  it('shows the time of day when a boundary is not at midnight', () => {
    const period = plain(
      formatServicePeriod('2027-02-01T10:00:00.000Z', '2027-03-01T10:00:00.000Z', 'en'),
    );

    expect(period).toContain('10:00');
    expect(period).toMatch(/\(UTC\)$/);
  });

  it.each([
    [undefined, '2027-04-01T00:00:00.000Z'],
    ['2027-03-01T00:00:00.000Z', undefined],
    ['not a date', '2027-04-01T00:00:00.000Z'],
    [null, null],
  ])('shows a dash for a period with a boundary missing (%s, %s)', (from, to) => {
    expect(formatServicePeriod(from, to, 'en')).toBe('—');
  });
});

describe('formatInstant', () => {
  it('writes one instant in UTC, with the marker', () => {
    expect(plain(formatInstant('2027-03-01T10:00:00.000Z', 'en'))).toBe(
      'Mar 1, 2027, 10:00 AM (UTC)',
    );
    expect(formatInstant(undefined, 'en')).toBe('—');
  });
});

describe('formatUtcDate', () => {
  it.each(['Europe/Paris', 'America/Los_Angeles', 'Pacific/Auckland', 'UTC'])(
    'writes the UTC day of an instant, marked, from %s',
    (zone) => {
      process.env.TZ = zone;

      expect(plain(formatUtcDate('2026-11-01T00:00:00Z', 'en'))).toBe(
        'Nov 1, 2026 (UTC)',
      );
    },
  );

  it('follows the language, and shows a dash for what is not a date', () => {
    expect(plain(formatUtcDate('2026-11-01T00:00:00Z', 'fr'))).toBe(
      '1 nov. 2026 (UTC)',
    );
    expect(formatUtcDate(undefined, 'en')).toBe('—');
    expect(formatUtcDate('not a date', 'en')).toBe('—');
  });
});

describe('formatUtcTime', () => {
  it.each(['Europe/Paris', 'America/Los_Angeles', 'UTC'])(
    'writes the UTC time of an instant, marked, from %s',
    (zone) => {
      process.env.TZ = zone;

      expect(plain(formatUtcTime('2026-11-01T18:17:25Z', 'en'))).toBe(
        '6:17 PM (UTC)',
      );
    },
  );

  it('follows the language, and shows a dash for what is not a date', () => {
    expect(plain(formatUtcTime('2026-11-01T18:17:25Z', 'fr'))).toBe(
      '18:17 (UTC)',
    );
    expect(formatUtcTime(undefined, 'en')).toBe('—');
    expect(formatUtcTime('not a date', 'en')).toBe('—');
  });
});

describe('splitUtcMarker', () => {
  it('sets the marker apart from the time or the period it ends', () => {
    expect(
      splitUtcMarker(formatUtcDate('2027-03-01T00:00:00.000Z', 'en')),
    ).toEqual({ marker: '(UTC)', text: 'Mar 1, 2027' });
    expect(
      plain(
        splitUtcMarker(
          formatServicePeriod('2027-03-01T00:00:00.000Z', '2027-04-01T00:00:00.000Z', 'en'),
        ).text,
      ),
    ).toBe('Mar 1 – Apr 1, 2027');
    expect(
      splitUtcMarker(formatUtcTime('2027-03-01T10:00:00.000Z', 'en')).marker,
    ).toBe('(UTC)');
  });

  it('gives back whole a text with no marker, such as the placeholder of a boundary that is missing', () => {
    expect(splitUtcMarker(formatInstant(undefined, 'en'))).toEqual({
      marker: '',
      text: '—',
    });
  });
});
