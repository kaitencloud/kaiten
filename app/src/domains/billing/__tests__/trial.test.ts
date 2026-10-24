import { describe, expect, it } from 'vite-plus/test';
import {
  canStartWithTrial,
  getTrialEnd,
  isValidTrialDays,
  MAX_TRIAL_DAYS,
} from '../logic';

describe('the length of a trial', () => {
  it('is bounded at a year: the API sets no upper bound, and the console does', () => {
    expect(MAX_TRIAL_DAYS).toBe(365);
  });

  it.each([0, 1, 14, 90, 365])('takes %i days', (days) => {
    expect(isValidTrialDays(days)).toBe(true);
  });

  it.each([-1, 366, 2.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_647])(
    'refuses %s days',
    (days) => {
      expect(isValidTrialDays(days)).toBe(false);
    },
  );
});

describe('which price can start with a trial', () => {
  it('is one billed in advance, whose first invoice follows the trial', () => {
    expect(canStartWithTrial('ADVANCE')).toBe(true);
  });

  it('is never one billed in arrears: the API cannot close such a trial', () => {
    expect(canStartWithTrial('ARREARS')).toBe(false);
  });
});

describe('when a trial ends', () => {
  it('is its days of 24 hours from the start, in UTC', () => {
    expect(
      getTrialEnd({
        startAt: new Date('2027-01-01T00:00:00.000Z'),
        trialDays: 14,
      }).toISOString(),
    ).toBe('2027-01-15T00:00:00.000Z');
  });

  it('counts from now when the subscription starts now, from the second the API anchors on', () => {
    expect(
      getTrialEnd({
        now: new Date('2027-01-01T10:30:45.678Z'),
        trialDays: 30,
      }).toISOString(),
    ).toBe('2027-01-31T10:30:45.000Z');
  });

  it('crosses a change of the clocks without losing an hour, since a day is 24 hours', () => {
    // The first Sunday of November 2027 is the day Paris leaves summer time.
    expect(
      getTrialEnd({
        startAt: new Date('2027-10-29T12:00:00.000Z'),
        trialDays: 7,
      }).toISOString(),
    ).toBe('2027-11-05T12:00:00.000Z');
  });
});
