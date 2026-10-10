import { describe, expect, it } from 'vite-plus/test';
import {
  toInstanceBillingEntries,
  toInstanceBillingSummary,
  type InstanceBillingSummaryInput,
} from '../logic';

const input = (
  overrides: Partial<InstanceBillingSummaryInput> = {},
): InstanceBillingSummaryInput => ({
  cancelAtPeriodEnd: false,
  currentPeriodEnd: '2027-04-01T00:00:00.000Z',
  pastDueSince: null,
  providerKind: 'NOOP',
  status: 'ACTIVE',
  trialEndsAt: null,
  ...overrides,
});

describe('toInstanceBillingSummary', () => {
  it.each(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED'] as const)(
    'reads %s, which the contract has, as the status',
    (status) => {
      expect(toInstanceBillingSummary(input({ status }))).toMatchObject({
        rawStatus: status,
        status,
      });
    },
  );

  it('leaves a status the contract does not have out and keeps what was sent', () => {
    const summary = toInstanceBillingSummary(input({ status: 'PAUSED' }));

    expect(summary.status).toBeUndefined();
    expect(summary.rawStatus).toBe('PAUSED');
  });

  it('does not take a status in another case or with a blank for one the contract has', () => {
    expect(toInstanceBillingSummary(input({ status: 'active' })).status).toBeUndefined();
    expect(toInstanceBillingSummary(input({ status: ' ACTIVE' })).status).toBeUndefined();
    expect(toInstanceBillingSummary(input({ status: '' })).status).toBeUndefined();
  });

  it('checks the provider kind against the contract too', () => {
    expect(toInstanceBillingSummary(input({ providerKind: 'STRIPE' })).providerKind).toBe('STRIPE');
    expect(toInstanceBillingSummary(input({ providerKind: 'PADDLE' })).providerKind).toBeUndefined();
  });

  it('reads the dates the API sends, and drops the ones it sends as null', () => {
    const summary = toInstanceBillingSummary(
      input({
        cancelAtPeriodEnd: true,
        pastDueSince: '2027-03-02T10:00:00.000Z',
        status: 'PAST_DUE',
        trialEndsAt: '2027-03-15T00:00:00.000Z',
      }),
    );

    expect(summary).toEqual({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: '2027-04-01T00:00:00.000Z',
      pastDueSince: '2027-03-02T10:00:00.000Z',
      providerKind: 'NOOP',
      rawStatus: 'PAST_DUE',
      status: 'PAST_DUE',
      trialEndsAt: '2027-03-15T00:00:00.000Z',
    });
    expect(toInstanceBillingSummary(input())).toMatchObject({
      pastDueSince: undefined,
      trialEndsAt: undefined,
    });
  });
});

describe('toInstanceBillingEntries', () => {
  it('pairs each instance of the page with its summary, and null with one nobody subscribed', () => {
    const entries = toInstanceBillingEntries([
      { billing: input({ status: 'TRIAL' }), slug: 'acme-production' },
      { billing: null, slug: 'acme-staging' },
    ]);

    expect(entries.map((entry) => entry.instanceSlug)).toEqual([
      'acme-production',
      'acme-staging',
    ]);
    expect(entries[0]?.summary?.status).toBe('TRIAL');
    expect(entries[1]?.summary).toBeNull();
  });
});
