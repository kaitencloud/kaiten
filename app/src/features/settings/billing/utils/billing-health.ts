import type { BillingHealth } from '@/api-client';
import type { BillingProviderKind } from '@/domains/billing';

/** What the health of billing counts, one for each thing that needs a person's attention. */
export type HealthItemId =
  | 'closeBacklog'
  | 'handoff'
  | 'held'
  | 'mismatches'
  | 'overdue'
  | 'pastDue'
  | 'pushFailures';

/**
 * What of the list of invoices lists what an item counts: one of its status views
 * (`?view=held`, `?view=overdue`, `?view=waiting` for what waits for the accounting
 * system) or a filter it opens with (`?status=PUSH_FAILED`).
 */
export type HealthItemSearch =
  | { status: 'PUSH_FAILED' }
  | { view: 'held' | 'overdue' | 'waiting' };

/**
 * Where a count leads to, to see what it counts: the list of invoices opened on a
 * status view or a filter, the Waiting view being the queue of the accounting system. An item that counts something nothing lists (an invoice whose
 * provider disagrees, a period, a subscription) has none, and is a figure and no link.
 */
export type HealthLink = {
  search: HealthItemSearch;
  to: '/invoices';
};

export type HealthItem = {
  count: number;
  id: HealthItemId;
  link?: HealthLink;
  /**
   * How long the oldest of what is counted has waited, as an instant: when an
   * invoice failed to push, when one was issued into the queue, when a period
   * was due to close.
   */
  oldestAt?: string;
  /** The checks that held the invoices, with how many each held; only for the held ones. */
  reasons?: Array<{ count: number; reason: string }>;
};

/**
 * What the health of billing counts, in the order a person reads it: what stops an
 * invoice (held, failing to push), what is late (overdue, waiting for the accounting
 * system), then what is out of step (a provider that disagrees, periods that did not
 * close, subscriptions that are not paid).
 */
export function getHealthItems(health: BillingHealth): HealthItem[] {
  return [
    {
      count: health.heldInvoices.count,
      id: 'held',
      link: { search: { view: 'held' }, to: '/invoices' },
      reasons: Object.entries(health.heldInvoices.byReason)
        .filter(([, count]) => count > 0)
        .map(([reason, count]) => ({ count, reason })),
    },
    {
      count: health.pushFailures.count,
      id: 'pushFailures',
      link: { search: { status: 'PUSH_FAILED' }, to: '/invoices' },
      oldestAt: health.pushFailures.oldestFailedAt,
    },
    {
      count: health.overdueInvoices,
      id: 'overdue',
      link: { search: { view: 'overdue' }, to: '/invoices' },
    },
    {
      count: health.handoff.pending,
      id: 'handoff',
      link: { search: { view: 'waiting' }, to: '/invoices' },
      oldestAt: health.handoff.oldestPendingIssuedAt,
    },
    { count: health.reconciliationMismatches30d, id: 'mismatches' },
    {
      count: health.closeBacklog.count,
      id: 'closeBacklog',
      oldestAt: health.closeBacklog.oldestDueAt,
    },
    { count: health.pastDueSubscriptions, id: 'pastDue' },
  ];
}

/** Whether nothing needs attention: every count is zero. */
export const isAllClear = (items: readonly HealthItem[]) =>
  items.every((item) => item.count === 0);

/**
 * How the last pass of a payment provider went, from the sync state the health
 * carries. The health says when the last pass was (as an instant, and as the seconds
 * since) and how it ended, and how many passes failed in a row; it does not keep when
 * one last succeeded.
 * - `never`: no pass yet;
 * - `failing`: the last passes failed, and the last was at `at`;
 * - `partial`: the last pass read what it could and left some invoices;
 * - `ok`: the last pass ended well, at `at`.
 */
export type ProviderSyncStanding =
  | { at: string; error?: string; failures: number; kind: 'failing' }
  | { at: string; error?: string; kind: 'ok' | 'partial' }
  | { kind: 'never' };

export function getProviderSyncStanding(
  health: BillingHealth,
  kind: BillingProviderKind,
  now: number = Date.now(),
): ProviderSyncStanding {
  const sync = health.providerSync.find((entry) => entry.providerKind === kind);
  // When the last pass ran: the instant the API gives, else the seconds since it.
  const at =
    sync?.lastSyncedAt ??
    (sync?.lagSeconds === undefined
      ? undefined
      : new Date(now - sync.lagSeconds * 1000).toISOString());
  if (!sync || at === undefined) {
    return { kind: 'never' };
  }
  if (sync.consecutiveFailures > 0 || sync.lastSyncStatus === 'FAILED') {
    return {
      at,
      error: sync.lastSyncError,
      failures: Math.max(sync.consecutiveFailures, 1),
      kind: 'failing',
    };
  }

  return {
    at,
    error: sync.lastSyncError,
    kind: sync.lastSyncStatus === 'PARTIAL' ? 'partial' : 'ok',
  };
}
