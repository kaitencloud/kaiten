import { describe, expect, it } from 'vite-plus/test';
import { buildPrice } from '../../../../../e2e/app/_support/fixtures/build-pricing';
import {
  getDaysSince,
  getAwaitedActivation,
  getDaysUntil,
  getFirstInvoiceAfterTrial,
  getHoursUntil,
  getSubscriptionNotices,
} from '../subscription-notices.utils';

const NOW = Date.parse('2027-03-10T12:00:00.000Z');

// A subscription with no plan change scheduled: the contract has the member null, as an object or null.
const NO_CHANGE = null as never;

describe('the days of a trial that are left', () => {
  it('rounds up, so that a trial ending in five hours has a day left', () => {
    expect(getDaysUntil('2027-03-10T17:00:00.000Z', NOW)).toBe(1);
    expect(getDaysUntil('2027-03-16T11:00:00.000Z', NOW)).toBe(6);
    expect(getDaysUntil('2027-03-17T12:00:00.000Z', NOW)).toBe(7);
  });

  it('is never below zero, and zero for what is no date', () => {
    expect(getDaysUntil('2027-03-01T00:00:00.000Z', NOW)).toBe(0);
    expect(getDaysUntil('soon', NOW)).toBe(0);
  });
});

describe('the hours a checkout has left to be paid', () => {
  it('rounds up, so that a checkout lapsing in ten minutes has an hour left', () => {
    expect(getHoursUntil('2027-03-10T12:10:00.000Z', NOW)).toBe(1);
    expect(getHoursUntil('2027-03-10T13:00:00.000Z', NOW)).toBe(1);
    expect(getHoursUntil('2027-03-11T10:30:00.000Z', NOW)).toBe(23);
  });

  it('is never below zero, and zero for what is no date', () => {
    expect(getHoursUntil('2027-03-10T11:00:00.000Z', NOW)).toBe(0);
    expect(getHoursUntil('soon', NOW)).toBe(0);
  });
});

describe('the invoice a checkout waits for the payment of', () => {
  const invoice = (
    createdAt: string,
    kind: 'ACTIVATION' | 'FINAL' | 'RENEWAL',
    status: 'DRAFT' | 'MANUAL' | 'PAID' | 'PUSHED' | 'VOID',
  ) => ({ createdAt, kind, status });

  it('is the latest activation invoice that is not settled', () => {
    const waiting = invoice('2027-03-10T10:00:00.000Z', 'ACTIVATION', 'PUSHED');

    expect(
      getAwaitedActivation([
        invoice('2027-03-09T10:00:00.000Z', 'ACTIVATION', 'VOID'),
        waiting,
        invoice('2027-03-10T11:00:00.000Z', 'RENEWAL', 'PUSHED'),
      ]),
    ).toBe(waiting);
  });

  it('is the recomposed one after a void', () => {
    const recomposed = invoice('2027-03-10T11:00:00.000Z', 'ACTIVATION', 'DRAFT');

    expect(
      getAwaitedActivation([
        invoice('2027-03-10T10:00:00.000Z', 'ACTIVATION', 'PUSHED'),
        recomposed,
      ]),
    ).toBe(recomposed);
  });

  it('is nothing once the activation is paid or void, or when there is none', () => {
    expect(
      getAwaitedActivation([
        invoice('2027-03-10T10:00:00.000Z', 'ACTIVATION', 'PAID'),
        invoice('2027-03-10T11:00:00.000Z', 'ACTIVATION', 'VOID'),
      ]),
    ).toBeUndefined();
    expect(getAwaitedActivation([])).toBeUndefined();
  });
});

describe('how long ago a subscription fell past due', () => {
  it('rounds down, never below zero', () => {
    expect(getDaysSince('2027-03-01T13:00:00.000Z', NOW)).toBe(8);
    expect(getDaysSince('2027-03-10T00:00:00.000Z', NOW)).toBe(0);
    expect(getDaysSince('2027-04-01T00:00:00.000Z', NOW)).toBe(0);
    expect(getDaysSince('never', NOW)).toBe(0);
  });
});

describe('when the first invoice of a trial is issued', () => {
  const trial = {
    billingPeriod: 'MONTHLY',
    currentPeriodEnd: '2027-03-15T00:00:00.000Z',
    trialEndsAt: '2027-03-15T00:00:00.000Z',
  } as const;

  it('is when the trial ends for a price billed in advance', () => {
    expect(
      getFirstInvoiceAfterTrial({ ...trial, basePrice: buildPrice({ id: 'a', unitAmountDecimal: '1' }) }),
    ).toBe('2027-03-15T00:00:00.000Z');
  });

  it('is when the first period after the trial closes for a price billed in arrears', () => {
    expect(
      getFirstInvoiceAfterTrial({
        ...trial,
        basePrice: buildPrice({ billingTiming: 'ARREARS', id: 'a', unitAmountDecimal: '1' }),
      }),
    ).toBe('2027-04-15T00:00:00.000Z');
  });

  it('falls back on the end of the period when the trial says none', () => {
    expect(
      getFirstInvoiceAfterTrial({
        basePrice: buildPrice({ id: 'a', unitAmountDecimal: '1' }),
        billingPeriod: 'MONTHLY',
        currentPeriodEnd: '2027-03-15T00:00:00.000Z',
        trialEndsAt: null,
      }),
    ).toBe('2027-03-15T00:00:00.000Z');
  });
});

describe('which notices a subscription calls for', () => {
  const change = { effectiveAt: '2027-04-01T00:00:00.000Z', licenseSlug: 'pro-v1', price: buildPrice({ id: 'p', unitAmountDecimal: '1' }), scheduledAt: '2027-03-01T00:00:00.000Z' };

  it('has none while it just runs, and none once it ended, whatever else it still carries', () => {
    expect(getSubscriptionNotices({ cancelAtPeriodEnd: false, scheduledChange: NO_CHANGE, status: 'ACTIVE' })).toEqual([]);
    expect(
      getSubscriptionNotices({ cancelAtPeriodEnd: true, scheduledChange: change, status: 'CANCELED' }),
    ).toEqual([]);
  });

  it('has the one that says what a checkout waits for, and no other', () => {
    expect(
      getSubscriptionNotices({ cancelAtPeriodEnd: false, scheduledChange: NO_CHANGE, status: 'INCOMPLETE' }),
    ).toEqual(['incomplete']);
    expect(
      getSubscriptionNotices({ cancelAtPeriodEnd: true, scheduledChange: change, status: 'INCOMPLETE' }),
    ).toEqual(['incomplete']);
    expect(
      getSubscriptionNotices({ cancelAtPeriodEnd: false, pendingLicenseSlug: 'pro-v3', scheduledChange: NO_CHANGE, status: 'ACTIVE' }),
    ).toEqual(['incomplete']);
  });

  it.each([
    [{ cancelAtPeriodEnd: false, scheduledChange: NO_CHANGE, status: 'TRIAL' }, ['trial']],
    [{ cancelAtPeriodEnd: false, scheduledChange: NO_CHANGE, status: 'PAST_DUE' }, ['past-due']],
    [{ cancelAtPeriodEnd: true, scheduledChange: NO_CHANGE, status: 'ACTIVE' }, ['cancellation']],
    [{ cancelAtPeriodEnd: false, scheduledChange: change, status: 'ACTIVE' }, ['scheduled-change']],
    [{ cancelAtPeriodEnd: true, scheduledChange: NO_CHANGE, status: 'PAST_DUE' }, ['past-due', 'cancellation']],
    [{ cancelAtPeriodEnd: false, scheduledChange: change, status: 'PAST_DUE' }, ['past-due', 'scheduled-change']],
  ] as const)('tells %j in this order: %j', (subscription, notices) => {
    expect(getSubscriptionNotices(subscription)).toEqual(notices);
  });
});
