import type { BillingHealth } from '@/api-client';

/** The health of billing when nothing needs attention: every count is zero, no provider has run. */
export const CLEAR_HEALTH: BillingHealth = {
  closeBacklog: { count: 0 },
  handoff: { pending: 0 },
  heldInvoices: {
    byReason: {
      LEDGER_CHAIN_BREAK: 0,
      LEDGER_COUNTER_MISMATCH: 0,
      LEDGER_SEQUENCE_GAP: 0,
    },
    count: 0,
  },
  overdueInvoices: 0,
  pastDueSubscriptions: 0,
  providerSync: [],
  pushFailures: { count: 0 },
  reconciliationMismatches30d: 0,
};

/** The health of billing, with what a test says differently from the clear one. */
export const healthWith = (
  overrides: Partial<BillingHealth> = {},
): BillingHealth => ({ ...CLEAR_HEALTH, ...overrides });

/** The sync state of a provider whose last pass ended well, minutes ago. */
export const syncedStripe = (
  overrides: Partial<BillingHealth['providerSync'][number]> = {},
): BillingHealth['providerSync'][number] => ({
  consecutiveFailures: 0,
  lastSyncStatus: 'SUCCESS',
  lastSyncedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  providerKind: 'STRIPE',
  ...overrides,
});
