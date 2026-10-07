import { describe, expect, it } from 'vite-plus/test';
import { dateTimeInputToInstant } from '../date-time-input';

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
