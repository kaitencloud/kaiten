import { describe, expect, it } from 'vite-plus/test';
import {
  dateTimeInputToInstant,
  instantToDateTimeInput,
  isTimeOfDay,
  joinDateTimeInput,
  leadingDayOfDateTimeInput,
  parseTimeOfDay,
  splitDateTimeInput,
} from '../date-time-input';
import { TEST_ZONES, useTimeZone } from '@/test-fixtures/time-zone';

describe.each(TEST_ZONES)('in $zone', ({ zone, utcMoment }) => {
  useTimeZone(zone, utcMoment);

  describe('dateTimeInputToInstant', () => {
    it('reads the text of a datetime-local input as UTC, as every billing time is', () => {
      expect(dateTimeInputToInstant('2027-03-03T10:00')).toBe(
        '2027-03-03T10:00:00.000Z',
      );
      expect(dateTimeInputToInstant('2027-03-03T10:00:30')).toBe(
        '2027-03-03T10:00:30.000Z',
      );
      expect(dateTimeInputToInstant('  2027-03-03T10:00  ')).toBe(
        '2027-03-03T10:00:00.000Z',
      );
    });

    it.each(['', 'yesterday', '2027-13-45T10:00', '2027-03-03'])(
      'is no instant when it reads %j',
      (value) => {
        expect(dateTimeInputToInstant(value)).toBeNull();
      },
    );
  });

  describe('instantToDateTimeInput', () => {
    it('writes an instant as the text of a datetime-local input, in UTC and to the minute', () => {
      expect(instantToDateTimeInput('2027-03-03T10:00:45.000Z')).toBe(
        '2027-03-03T10:00',
      );
      expect(
        dateTimeInputToInstant(instantToDateTimeInput('2027-03-03T10:00:00.000Z')),
      ).toBe('2027-03-03T10:00:00.000Z');
    });

    it.each([undefined, '', 'yesterday'])(
      'is empty for %j, which is no instant',
      (value) => {
        expect(instantToDateTimeInput(value)).toBe('');
      },
    );
  });

  describe('the two halves of a date and time', () => {
    it('splits the text of a datetime-local input into its day and its time', () => {
      expect(splitDateTimeInput('2027-03-03T10:00')).toEqual({
        day: '2027-03-03',
        time: '10:00',
      });
      expect(splitDateTimeInput('2027-03-03T10:00:45')).toEqual({
        day: '2027-03-03',
        time: '10:00',
      });
    });

    it.each(['', 'yesterday', '2027-03-03', '2027-13-45T10:00', '2027-02-31T10:00', '2027-03-03T25:00'])(
      'splits %j into nothing',
      (value) => {
        expect(splitDateTimeInput(value)).toBeNull();
      },
    );

    it.each(['2027-03-03T10:00', '2027-12-31T23:59', '2028-02-29T00:00'])(
      'joins what it split in %s back into the same text, and the same instant',
      (value) => {
        const parts = splitDateTimeInput(value);

        expect(parts).not.toBeNull();
        const joined = joinDateTimeInput(parts!.day, parts!.time);

        expect(joined).toBe(value);
        expect(dateTimeInputToInstant(joined)).toBe(`${value}:00.000Z`);
        expect(instantToDateTimeInput(dateTimeInputToInstant(joined) ?? '')).toBe(value);
      },
    );

    it.each(['00:00', '09:30', '23:59'])('takes %s as a time of day', (value) => {
      expect(isTimeOfDay(value)).toBe(true);
    });

    it.each(['', '9:30', '24:00', '10:60', '10:00:30', 'noon'])(
      'takes %j for no time of day',
      (value) => {
        expect(isTimeOfDay(value)).toBe(false);
      },
    );
  });

  it.each([
    ['09:30', '09:30'],
    ['9:30', '09:30'],
    ['930', '09:30'],
    ['0930', '09:30'],
    ['1430', '14:30'],
    ['  7:05 ', '07:05'],
    ['0:00', '00:00'],
  ])('reads %j typed by hand as the time %s', (typed, time) => {
    expect(parseTimeOfDay(typed)).toBe(time);
  });

  it.each(['', '9', '93', '9:5', '24:00', '10:60', '2:30 PM', '10:00:30', 'noon'])(
    'reads %j as no time of day',
    (typed) => {
      expect(parseTimeOfDay(typed)).toBeNull();
    },
  );

  it('keeps the real day a refused text starts with', () => {
    expect(leadingDayOfDateTimeInput('2027-03-03T9:15')).toBe('2027-03-03');
    expect(leadingDayOfDateTimeInput('2027-03-03T10:00')).toBe('2027-03-03');
    expect(leadingDayOfDateTimeInput('2027-02-31T10:00')).toBe('');
    expect(leadingDayOfDateTimeInput('2027-03-03')).toBe('');
    expect(leadingDayOfDateTimeInput('')).toBe('');
  });
});
