import { describe, expect, it } from 'vite-plus/test';
import {
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
