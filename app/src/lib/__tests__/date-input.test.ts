import { describe, expect, it } from 'vite-plus/test';
import {
  calendarDateToDateInput,
  dateInputToCalendarDate,
  dateInputToInstant,
  instantToDateInput,
  isPeriodInvalid,
} from '../date-input';

describe('the days of a period', () => {
  it('reads a day as the start of that day in UTC', () => {
    expect(dateInputToInstant('2027-03-01')).toBe('2027-03-01T00:00:00.000Z');
  });

  it.each(['', 'soon', '2027-13-45', '03/01/2027'])(
    'reads %j as no date',
    (value) => {
      expect(dateInputToInstant(value)).toBeUndefined();
    },
  );

  it('writes an instant as the UTC day a date input holds', () => {
    expect(instantToDateInput('2027-03-01T23:59:59.000Z')).toBe('2027-03-01');
    expect(instantToDateInput(undefined)).toBe('');
    expect(instantToDateInput('not a date')).toBe('');
  });

  it('refuses a period that ends before it starts, or on the instant it starts', () => {
    expect(
      isPeriodInvalid('2027-03-02T00:00:00.000Z', '2027-03-01T00:00:00.000Z'),
    ).toBe(true);
    expect(
      isPeriodInvalid('2027-03-01T00:00:00.000Z', '2027-03-01T00:00:00.000Z'),
    ).toBe(true);
    expect(
      isPeriodInvalid('2027-03-01T00:00:00.000Z', '2027-03-02T00:00:00.000Z'),
    ).toBe(false);
  });

  it('accepts a period open at either end', () => {
    expect(isPeriodInvalid('2027-03-01T00:00:00.000Z', undefined)).toBe(false);
    expect(isPeriodInvalid(undefined, '2027-03-01T00:00:00.000Z')).toBe(false);
    expect(isPeriodInvalid(undefined, undefined)).toBe(false);
  });
});

describe('the days of a calendar', () => {
  it('shows a day as that day at noon, whatever the zone of the browser', () => {
    const date = dateInputToCalendarDate('2027-03-01');

    expect(date?.getFullYear()).toBe(2027);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(1);
    expect(date?.getHours()).toBe(12);
  });

  it.each(['', 'soon', '2027-13-45', '2027-02-31', '03/01/2027'])(
    'shows %j as no day',
    (value) => {
      expect(dateInputToCalendarDate(value)).toBeUndefined();
    },
  );

  it.each([
    '2027-03-01',
    '2027-12-31',
    '2028-02-29',
    '2099-01-01',
    '2000-01-01',
    '2026-03-29',
    '2026-10-25',
    '2026-09-20',
  ])('gives back the day %s it was given, and the instant it stands for', (day) => {
    const date = dateInputToCalendarDate(day);

    expect(date).toBeDefined();
    expect(calendarDateToDateInput(date as Date)).toBe(day);
    expect(dateInputToInstant(day)).toBe(`${day}T00:00:00.000Z`);
  });

  it('writes the day a calendar reports from its own fields, not from the UTC instant', () => {
    expect(calendarDateToDateInput(new Date(2027, 2, 2, 0, 30))).toBe(
      '2027-03-02',
    );
    expect(calendarDateToDateInput(new Date(2027, 2, 2, 23, 30))).toBe(
      '2027-03-02',
    );
  });
});
