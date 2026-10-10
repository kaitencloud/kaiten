import { describe, expect, it } from 'vite-plus/test';
import type { BillingHealth } from '@/api-client';
import { CLEAR_HEALTH, healthWith } from '@/test-fixtures/billing-health-fixtures';
import {
  getHealthItems,
  getProviderSyncStanding,
  isAllClear,
} from '../billing-health';

const CLEAR = CLEAR_HEALTH;
const health = healthWith;

describe('what the health of billing counts', () => {
  it('lists seven things, held and failing ones first, in the order a person reads them', () => {
    expect(getHealthItems(CLEAR).map((item) => item.id)).toEqual([
      'held',
      'pushFailures',
      'overdue',
      'handoff',
      'mismatches',
      'closeBacklog',
      'pastDue',
    ]);
  });

  it('is clear when every count is zero, and not when one is not', () => {
    expect(isAllClear(getHealthItems(CLEAR))).toBe(true);
    expect(
      isAllClear(getHealthItems(health({ pastDueSubscriptions: 1 }))),
    ).toBe(false);
  });

  it('leads each count that something lists to it, and the others to none', () => {
    const items = getHealthItems(
      health({
        closeBacklog: { count: 1 },
        handoff: { pending: 2 },
        heldInvoices: { byReason: {}, count: 3 },
        overdueInvoices: 4,
        pastDueSubscriptions: 5,
        pushFailures: { count: 6 },
        reconciliationMismatches30d: 7,
      }),
    );
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));

    expect(byId.held).toMatchObject({
      count: 3,
      link: { search: { view: 'held' }, to: '/invoices' },
    });
    expect(byId.pushFailures).toMatchObject({
      count: 6,
      link: { search: { status: 'PUSH_FAILED' }, to: '/invoices' },
    });
    expect(byId.overdue).toMatchObject({
      count: 4,
      link: { search: { view: 'overdue' }, to: '/invoices' },
    });
    // What waits for the accounting system is what its queue lists, a view of the invoices.
    expect(byId.handoff).toMatchObject({
      count: 2,
      link: { search: { view: 'waiting' }, to: '/invoices' },
    });
    expect(byId.mismatches).toMatchObject({ count: 7 });
    expect(byId.mismatches.link).toBeUndefined();
    expect(byId.closeBacklog.link).toBeUndefined();
    expect(byId.pastDue.link).toBeUndefined();
  });

  it('keeps when the oldest of what waits began waiting', () => {
    const items = getHealthItems(
      health({
        closeBacklog: { count: 1, oldestDueAt: '2027-03-01T00:00:00Z' },
        handoff: { oldestPendingIssuedAt: '2027-03-02T00:00:00Z', pending: 1 },
        pushFailures: { count: 1, oldestFailedAt: '2027-03-03T00:00:00Z' },
      }),
    );

    expect(items.find((item) => item.id === 'closeBacklog')?.oldestAt).toBe(
      '2027-03-01T00:00:00Z',
    );
    expect(items.find((item) => item.id === 'handoff')?.oldestAt).toBe(
      '2027-03-02T00:00:00Z',
    );
    expect(items.find((item) => item.id === 'pushFailures')?.oldestAt).toBe(
      '2027-03-03T00:00:00Z',
    );
  });

  it('names the checks that held invoices and how many each held, leaving out the ones that held none', () => {
    const items = getHealthItems(
      health({
        heldInvoices: {
          byReason: {
            LEDGER_CHAIN_BREAK: 0,
            LEDGER_COUNTER_MISMATCH: 1,
            LEDGER_SEQUENCE_GAP: 2,
          },
          count: 3,
        },
      }),
    );

    expect(items[0].reasons).toEqual([
      { count: 1, reason: 'LEDGER_COUNTER_MISMATCH' },
      { count: 2, reason: 'LEDGER_SEQUENCE_GAP' },
    ]);
  });
});

describe('how the last pass of a provider went', () => {
  const sync = (entry: Partial<BillingHealth['providerSync'][number]>) =>
    health({
      providerSync: [
        { consecutiveFailures: 0, providerKind: 'STRIPE', ...entry },
      ],
    });

  it('is never when the provider has not been read yet, or is not in the health', () => {
    expect(getProviderSyncStanding(CLEAR, 'STRIPE')).toEqual({ kind: 'never' });
    expect(getProviderSyncStanding(sync({}), 'STRIPE')).toEqual({
      kind: 'never',
    });
  });

  it('is ok after a pass that ended well', () => {
    expect(
      getProviderSyncStanding(
        sync({ lastSyncStatus: 'SUCCESS', lastSyncedAt: '2027-03-01T10:00:00Z' }),
        'STRIPE',
      ),
    ).toEqual({ at: '2027-03-01T10:00:00Z', error: undefined, kind: 'ok' });
  });

  it('is partial after a pass that left invoices, with why', () => {
    expect(
      getProviderSyncStanding(
        sync({
          lastSyncError: 'could not apply in_1',
          lastSyncStatus: 'PARTIAL',
          lastSyncedAt: '2027-03-01T10:00:00Z',
        }),
        'STRIPE',
      ),
    ).toEqual({
      at: '2027-03-01T10:00:00Z',
      error: 'could not apply in_1',
      kind: 'partial',
    });
  });

  it('is failing after passes that failed in a row, with the last error and when', () => {
    expect(
      getProviderSyncStanding(
        sync({
          consecutiveFailures: 3,
          lastSyncError: 'the payment provider could not be reached',
          lastSyncStatus: 'FAILED',
          lastSyncedAt: '2027-03-01T10:00:00Z',
        }),
        'STRIPE',
      ),
    ).toEqual({
      at: '2027-03-01T10:00:00Z',
      error: 'the payment provider could not be reached',
      failures: 3,
      kind: 'failing',
    });
  });

  it('counts a failed last pass as one failure when the count says none', () => {
    expect(
      getProviderSyncStanding(
        sync({ lastSyncStatus: 'FAILED', lastSyncedAt: '2027-03-01T10:00:00Z' }),
        'STRIPE',
      ),
    ).toMatchObject({ failures: 1, kind: 'failing' });
  });

  it('tells when the last pass ran from the seconds since, where the API gives no instant', () => {
    const now = Date.parse('2027-03-01T12:00:00Z');

    expect(
      getProviderSyncStanding(
        sync({ consecutiveFailures: 3, lagSeconds: 3600, lastSyncStatus: 'FAILED' }),
        'STRIPE',
        now,
      ),
    ).toEqual({
      at: '2027-03-01T11:00:00.000Z',
      error: undefined,
      failures: 3,
      kind: 'failing',
    });
  });

  it('prefers the instant to the seconds since', () => {
    expect(
      getProviderSyncStanding(
        sync({ lagSeconds: 3600, lastSyncStatus: 'SUCCESS', lastSyncedAt: '2027-03-01T10:00:00Z' }),
        'STRIPE',
        Date.parse('2027-03-01T12:00:00Z'),
      ),
    ).toMatchObject({ at: '2027-03-01T10:00:00Z', kind: 'ok' });
  });

  it('reads the entry of the provider asked for', () => {
    const both = health({
      providerSync: [
        {
          consecutiveFailures: 2,
          lastSyncStatus: 'FAILED',
          lastSyncedAt: '2027-03-01T10:00:00Z',
          providerKind: 'NOOP',
        },
        {
          consecutiveFailures: 0,
          lastSyncStatus: 'SUCCESS',
          lastSyncedAt: '2027-03-02T10:00:00Z',
          providerKind: 'STRIPE',
        },
      ],
    });

    expect(getProviderSyncStanding(both, 'STRIPE')).toMatchObject({
      kind: 'ok',
    });
  });
});
