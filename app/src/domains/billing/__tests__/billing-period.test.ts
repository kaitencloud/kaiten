import { describe, expect, it } from 'vite-plus/test';
import {
  addMonthsClamped,
  BILLING_PERIOD_MONTHS,
  BILLING_PERIODS,
  getBillingPeriodLabelKey,
  getBillingPeriodSuffixKey,
  getBillingTimingLabelKey,
  getFirstInvoiceTiming,
  getSubscriptionStartBounds,
} from '../logic';

const utc = (iso: string) => new Date(iso);

describe('addMonthsClamped', () => {
  it.each([
    ['2027-01-31T00:00:00Z', 1, '2027-02-28T00:00:00.000Z'],
    // A leap year keeps its 29th.
    ['2028-01-31T00:00:00Z', 1, '2028-02-29T00:00:00.000Z'],
    ['2027-03-31T10:30:00Z', 1, '2027-04-30T10:30:00.000Z'],
    // The day is clamped from the date it started from, not from the last result.
    ['2027-01-31T00:00:00Z', 3, '2027-04-30T00:00:00.000Z'],
    ['2027-08-31T00:00:00Z', 6, '2028-02-29T00:00:00.000Z'],
    ['2027-11-15T00:00:00Z', 3, '2028-02-15T00:00:00.000Z'],
    ['2027-03-31T00:00:00Z', -1, '2027-02-28T00:00:00.000Z'],
    ['2027-01-15T00:00:00Z', -3, '2026-10-15T00:00:00.000Z'],
    ['2027-06-15T08:00:00Z', 12, '2028-06-15T08:00:00.000Z'],
  ])('moves %s by %i months to %s', (from, months, expected) => {
    expect(addMonthsClamped(utc(from), months).toISOString()).toBe(expected);
  });

  it('counts in UTC whatever the zone of the machine', () => {
    const original = process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati';
    try {
      expect(
        addMonthsClamped(utc('2027-01-31T23:00:00Z'), 1).toISOString(),
      ).toBe('2027-02-28T23:00:00.000Z');
    } finally {
      if (original === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = original;
      }
    }
  });

  it('does not change the date it is given', () => {
    const date = utc('2027-01-31T00:00:00Z');

    addMonthsClamped(date, 1);

    expect(date.toISOString()).toBe('2027-01-31T00:00:00.000Z');
  });
});

describe('the billing periods', () => {
  it('count the months the API counts them in', () => {
    expect(BILLING_PERIOD_MONTHS).toEqual({
      ANNUAL: 12,
      MONTHLY: 1,
      QUARTERLY: 3,
      SEMI_ANNUAL: 6,
    });
    expect([...BILLING_PERIODS].sort()).toEqual(
      ['ANNUAL', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL'].sort(),
    );
  });

  it('read in the words of the prices of a license version', () => {
    for (const period of BILLING_PERIODS) {
      expect(getBillingPeriodLabelKey(period)).toBe(
        `Pages.Licenses.Prices.Periods.${period}`,
      );
      expect(getBillingPeriodSuffixKey(period)).toBe(
        `Pages.Licenses.Prices.PeriodSuffix.${period}`,
      );
    }
    expect(getBillingTimingLabelKey('ADVANCE')).toBe(
      'Pages.Licenses.Prices.Timings.ADVANCE.label',
    );
    expect(getBillingTimingLabelKey('ARREARS')).toBe(
      'Pages.Licenses.Prices.Timings.ARREARS.label',
    );
  });
});

describe('getSubscriptionStartBounds', () => {
  const now = utc('2027-03-31T12:00:00Z');

  it('reaches back one billing period and not beyond now', () => {
    expect(getSubscriptionStartBounds('MONTHLY', now)).toEqual({
      earliest: utc('2027-02-28T12:00:00Z'),
      latest: now,
    });
    expect(getSubscriptionStartBounds('ANNUAL', now).earliest).toEqual(
      utc('2026-03-31T12:00:00Z'),
    );
    expect(getSubscriptionStartBounds('QUARTERLY', now).earliest).toEqual(
      utc('2026-12-31T12:00:00Z'),
    );
  });
});

describe('getFirstInvoiceTiming', () => {
  const now = utc('2027-03-15T12:00:00Z');

  it('issues the first invoice at once for a price billed in advance', () => {
    expect(
      getFirstInvoiceTiming({
        billingPeriod: 'MONTHLY',
        billingTiming: 'ADVANCE',
        now,
      }),
    ).toEqual({ kind: 'now' });
    // Whatever the start: the activation invoice follows the subscription.
    expect(
      getFirstInvoiceTiming({
        billingPeriod: 'ANNUAL',
        billingTiming: 'ADVANCE',
        now,
        startAt: utc('2027-03-01T00:00:00Z'),
      }),
    ).toEqual({ kind: 'now' });
  });

  it('waits for the first period to close for a price billed in arrears', () => {
    expect(
      getFirstInvoiceTiming({
        billingPeriod: 'MONTHLY',
        billingTiming: 'ARREARS',
        now,
      }),
    ).toEqual({
      alreadyDue: false,
      at: utc('2027-04-15T12:00:00Z'),
      kind: 'at-period-end',
    });
  });

  it('counts the period from the start typed, and says when it has already closed', () => {
    expect(
      getFirstInvoiceTiming({
        billingPeriod: 'MONTHLY',
        billingTiming: 'ARREARS',
        now,
        startAt: utc('2027-02-20T00:00:00Z'),
      }),
    ).toEqual({
      alreadyDue: false,
      at: utc('2027-03-20T00:00:00Z'),
      kind: 'at-period-end',
    });
    // A contract entered late: the period that began on Feb 1 closed on Mar 1.
    expect(
      getFirstInvoiceTiming({
        billingPeriod: 'MONTHLY',
        billingTiming: 'ARREARS',
        now,
        startAt: utc('2027-02-01T00:00:00Z'),
      }),
    ).toEqual({
      alreadyDue: true,
      at: utc('2027-03-01T00:00:00Z'),
      kind: 'at-period-end',
    });
  });

  it('truncates the start to the second, as the API does', () => {
    const result = getFirstInvoiceTiming({
      billingPeriod: 'MONTHLY',
      billingTiming: 'ARREARS',
      now,
      startAt: new Date('2027-03-01T10:00:00.900Z'),
    });

    expect(result).toMatchObject({
      at: utc('2027-04-01T10:00:00.000Z'),
      kind: 'at-period-end',
    });
  });
});
