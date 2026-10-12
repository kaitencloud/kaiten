import { describe, expect, it } from 'vite-plus/test';
import {
  getHandoffStatusLabelKey,
  getProviderKindLabelKey,
  getRetentionStart,
  HANDOFF_STATUSES,
  INVOICE_PROVIDER_KINDS,
  isHandoffLeased,
} from '../logic';

describe('where the usage the organization keeps begins', () => {
  const now = Date.parse('2027-03-31T12:00:00.000Z');

  it('is the given number of months before now, in UTC', () => {
    expect(getRetentionStart(12, now)?.toISOString()).toBe(
      '2026-03-31T12:00:00.000Z',
    );
    expect(getRetentionStart(1, now)?.toISOString()).toBe(
      '2027-03-03T12:00:00.000Z',
    );
  });

  it.each([null, undefined, 0, -3])(
    'has no start when the retention is %s: usage is kept forever, or the API cannot tell',
    (months) => {
      expect(getRetentionStart(months, now)).toBeNull();
    },
  );
});

describe('the lease of a handoff', () => {
  const now = Date.parse('2027-03-10T12:00:00.000Z');
  const later = '2027-03-10T12:00:01.000Z';
  const earlier = '2027-03-10T11:59:59.000Z';

  it('is held while an invoice that waits has a lease that has not run out', () => {
    expect(
      isHandoffLeased({ leasedUntil: later, status: 'PENDING' }, now),
    ).toBe(true);
  });

  it('is not held once it ran out: the invoice can be claimed again', () => {
    expect(
      isHandoffLeased({ leasedUntil: earlier, status: 'PENDING' }, now),
    ).toBe(false);
  });

  it('is not held by an invoice that was acknowledged or never needed it', () => {
    expect(
      isHandoffLeased({ leasedUntil: later, status: 'ACKNOWLEDGED' }, now),
    ).toBe(false);
    expect(
      isHandoffLeased({ leasedUntil: later, status: 'NOT_REQUIRED' }, now),
    ).toBe(false);
  });

  it('is not held when there is no lease, or one that is no date', () => {
    expect(isHandoffLeased({ status: 'PENDING' }, now)).toBe(false);
    expect(
      isHandoffLeased({ leasedUntil: 'not a date', status: 'PENDING' }, now),
    ).toBe(false);
  });
});

describe('the words of the handoff and of the provider', () => {
  it('has a label for every handoff status and provider', () => {
    for (const status of HANDOFF_STATUSES) {
      expect(getHandoffStatusLabelKey(status)).toBe(
        `Features.Billing.HandoffStatus.${status}`,
      );
    }
    for (const kind of INVOICE_PROVIDER_KINDS) {
      expect(getProviderKindLabelKey(kind)).toBe(
        `Features.Billing.ProviderKind.${kind}`,
      );
    }
  });
});
