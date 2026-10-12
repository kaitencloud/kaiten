import { describe, expect, it } from 'vite-plus/test';
import type { CancelFollowUpsOutcome } from '../../hooks/use-cancel-follow-ups';
import {
  getCancellationKind,
  getFailedFollowUps,
  getProposedEndDate,
  hasFailedFollowUps,
  mergeFollowUps,
} from '../cancellation.utils';

describe('how a cancellation takes effect', () => {
  it('ends a trial at once, whatever the mode', () => {
    expect(getCancellationKind({ status: 'TRIAL' }, 'AT_PERIOD_END')).toBe('TRIAL');
    expect(getCancellationKind({ status: 'TRIAL' }, 'IMMEDIATE')).toBe('TRIAL');
  });

  it('ends the others at once when it is immediate, and at the end of the period otherwise', () => {
    expect(getCancellationKind({ status: 'ACTIVE' }, 'IMMEDIATE')).toBe('IMMEDIATE');
    expect(getCancellationKind({ status: 'PAST_DUE' }, 'IMMEDIATE')).toBe('IMMEDIATE');
    expect(getCancellationKind({ status: 'ACTIVE' }, 'AT_PERIOD_END')).toBe('SCHEDULED');
  });
});

describe('the day the license is proposed to end on', () => {
  const subscription = { currentPeriodEnd: '2027-04-01T00:00:00.000Z' };

  it('is the end of the period for a cancellation that waits for it', () => {
    expect(getProposedEndDate(subscription, 'AT_PERIOD_END')).toBe('2027-04-01T00:00');
  });

  it('is now for one that does not, to the minute and in UTC', () => {
    expect(
      getProposedEndDate(subscription, 'IMMEDIATE', new Date('2027-03-10T10:25:45.000Z')),
    ).toBe('2027-03-10T10:25');
  });
});

const outcome = (overrides: Partial<CancelFollowUpsOutcome> = {}): CancelFollowUpsOutcome => ({
  addons: null,
  endLicenseDate: null,
  ...overrides,
});

describe('retrying what failed beside a cancellation', () => {
  it('has nothing to retry when nothing failed, or nothing was asked', () => {
    expect(hasFailedFollowUps(outcome())).toBe(false);
    expect(
      hasFailedFollowUps(
        outcome({
          addons: { failed: [], removed: ['seats'] },
          endLicenseDate: { instant: '2027-04-01T00:00:00.000Z', ok: true },
        }),
      ),
    ).toBe(false);
  });

  it('retries the add-ons that could not be removed and the end that could not be set, and only them', () => {
    const failed = outcome({
      addons: {
        failed: [{ addonSlug: 'extra-seats-v1', error: new Error('x') }],
        removed: ['connector-v1'],
      },
      endLicenseDate: { error: new Error('y'), instant: '2027-04-01T00:00:00.000Z', ok: false },
    });

    expect(hasFailedFollowUps(failed)).toBe(true);
    expect(getFailedFollowUps(failed)).toEqual({
      addonSlugs: ['extra-seats-v1'],
      endLicenseDate: '2027-04-01T00:00:00.000Z',
    });
  });

  it('keeps what the first try did when the retry has its own outcome', () => {
    const first = outcome({
      addons: {
        failed: [{ addonSlug: 'extra-seats-v1', error: new Error('x') }],
        removed: ['connector-v1'],
      },
      endLicenseDate: { instant: '2027-04-01T00:00:00.000Z', ok: true },
    });
    const retry = outcome({ addons: { failed: [], removed: ['extra-seats-v1'] } });

    expect(mergeFollowUps(first, retry)).toEqual({
      addons: { failed: [], removed: ['connector-v1', 'extra-seats-v1'] },
      // The retry asked for no end: what was done stays done.
      endLicenseDate: { instant: '2027-04-01T00:00:00.000Z', ok: true },
    });
  });

  it('is null for an outcome that never asked for either', () => {
    expect(mergeFollowUps(outcome(), outcome())).toEqual(outcome());
  });
});
