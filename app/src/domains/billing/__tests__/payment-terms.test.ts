import { describe, expect, it } from 'vite-plus/test';
import { isValidDaysUntilDue, MAX_DAYS_UNTIL_DUE } from '../logic';

describe('the payment terms of an invoice', () => {
  it('are due within a year at most', () => {
    expect(MAX_DAYS_UNTIL_DUE).toBe(365);
  });

  it.each([0, 1, 30, 365])('take %i days', (days) => {
    expect(isValidDaysUntilDue(days)).toBe(true);
  });

  it.each([-1, 366, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'do not take %s days',
    (days) => {
      expect(isValidDaysUntilDue(days)).toBe(false);
    },
  );
});
