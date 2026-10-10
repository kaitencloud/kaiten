import type { BillingHealth } from '@/api-client';
import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { BillingInvoicesDriver } from '../_support/drivers/billing-invoices.driver';
import { BillingSettingsDriver } from '../_support/drivers/billing-settings.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { BILLED_NOW } from './billed-instances';
import { createStripeBillingModel } from './billing.scenarios';

// The settings of billing say where Stripe stands and what needs a person's attention:
// the card of the providers reads the capabilities and how the last pass of Stripe went,
// and the health counts, in one tile each, what is held, late, waiting or out of step.
// "Sync now" runs a pass of Stripe without waiting for the periodic one. The page is
// frozen at `BILLED_NOW`, so that "an hour ago" is the same whatever day it runs.

const SYNC_WRITES = /\/api\/billing\/sync$/;

/** What `GET /billing/health` answers when each thing it counts needs attention. */
const NEEDS_ATTENTION: BillingHealth = {
  closeBacklog: { count: 2, oldestDueAt: '2026-10-04T12:00:00.000Z' },
  handoff: { oldestPendingIssuedAt: '2026-09-27T12:00:00.000Z', pending: 4 },
  heldInvoices: {
    byReason: {
      LEDGER_CHAIN_BREAK: 1,
      LEDGER_COUNTER_MISMATCH: 0,
      LEDGER_SEQUENCE_GAP: 2,
    },
    count: 3,
  },
  overdueInvoices: 2,
  pastDueSubscriptions: 1,
  providerSync: [],
  pushFailures: { count: 1, oldestFailedAt: '2026-10-07T09:00:00.000Z' },
  reconciliationMismatches30d: 1,
};

const ALL_CLEAR: BillingHealth = {
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

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BILLED_NOW));
});

test.describe('where Stripe stands in the providers of the organization', () => {
  test('is connected to a test account, with when its last pass ran', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createStripeBillingModel();
    model.providers.setSyncState({
      consecutiveFailures: 0,
      lastSyncStatus: 'SUCCESS',
      lastSyncedAt: '2026-10-07T11:56:00.000Z',
    });
    await installBillingAppMocks(page, model);

    await settings.goto();

    await expect(settings.stripe()).toHaveAttribute(
      'data-standing',
      'connected',
    );
    await expect(settings.stripe()).toContainText('Connected');
    await expect(settings.stripe()).toContainText('Test mode');
    await expect(settings.stripeSync()).toHaveText(
      'Last synced 4 minutes ago.',
    );
    await expect(
      settings.stripe().getByRole('link', { name: 'Manage the connection' }),
    ).toHaveAttribute('href', '/integrations/connectors/stripe');
  });

  test('warns when its passes keep failing, with how many, when the last was and what it said', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createStripeBillingModel();
    model.providers.setSyncState({
      consecutiveFailures: 3,
      lastSyncError: 'the payment provider could not be reached',
      lastSyncStatus: 'FAILED',
      lastSyncedAt: '2026-10-07T11:00:00.000Z',
    });
    await installBillingAppMocks(page, model);

    await settings.goto();

    await expect(settings.stripeSync()).toHaveAttribute(
      'data-standing',
      'failing',
    );
    await expect(settings.stripeSync()).toContainText(
      '3 syncs in a row failed. The last was 1 hour ago.',
    );
    await expect(settings.stripeSync()).toContainText(
      'Last error: the payment provider could not be reached',
    );
  });

  test('warns when the last pass left invoices it could not apply', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createStripeBillingModel();
    model.providers.setSyncState({
      consecutiveFailures: 0,
      lastSyncError: 'in_mm: the invoice could not be read',
      lastSyncStatus: 'PARTIAL',
      lastSyncedAt: '2026-10-07T11:30:00.000Z',
    });
    await installBillingAppMocks(page, model);

    await settings.goto();

    await expect(settings.stripeSync()).toHaveAttribute(
      'data-standing',
      'partial',
    );
    await expect(settings.stripeSync()).toContainText(
      'Last synced 30 minutes ago, but some invoices could not be applied.',
    );
  });

  test('says that no pass has run yet, rather than guess', async ({ page }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(
      page,
      createStripeBillingModel({ sync: 'never' }),
    );

    await settings.goto();

    await expect(settings.stripeSync()).toHaveText(
      'Not read yet: no pass of Stripe has run.',
    );
  });

  test('is a live account when the key is a live one', async ({ page }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(
      page,
      createStripeBillingModel({ standing: 'connectedLive' }),
    );

    await settings.goto();

    await expect(settings.stripe()).toContainText('Live mode');
  });

  test('is not connected yet, with the way to connect it, and no pass to speak of', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(
      page,
      createStripeBillingModel({ standing: 'available' }),
    );

    await settings.goto();

    await expect(settings.stripe()).toHaveAttribute(
      'data-standing',
      'available',
    );
    await expect(settings.stripe()).toContainText('Not connected');
    await expect(settings.stripeSync()).toHaveCount(0);
    await expect(
      settings.stripe().getByRole('link', { name: 'Connect Stripe' }),
    ).toHaveAttribute('href', '/integrations/connectors/stripe');
  });

  const unavailable = [
    ['notEntitled', 'the plan leaves it out', 'Not included in your plan.'],
    [
      'vaultMissing',
      'the deployment has no Vault',
      'Needs a Vault to store the key in, and this deployment has none configured.',
    ],
  ] as const;
  for (const [standing, why, reason] of unavailable) {
    test(`is unavailable, with the reason, when ${why}`, async ({ page }) => {
      const settings = new BillingSettingsDriver(page);
      await installBillingAppMocks(
        page,
        createStripeBillingModel({ standing }),
      );

      await settings.goto();

      await expect(settings.stripe()).toHaveAttribute(
        'data-standing',
        'unavailable',
      );
      await expect(settings.stripe()).toContainText('Unavailable');
      await expect(settings.stripe()).toContainText(reason);
      await expect(settings.stripeSync()).toHaveCount(0);
      await expect(
        settings.stripe().getByRole('link', { name: 'See why' }),
      ).toHaveAttribute('href', '/integrations/connectors/stripe');
    });
  }

  test('leads to the connector only a session that may read the settings of the organization', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.reader);
    await installBillingAppMocks(page, createStripeBillingModel());

    await settings.goto();

    await expect(settings.stripe()).toContainText('Connected');
    await expect(settings.stripe().getByRole('link')).toHaveCount(0);
  });
});

test.describe('the health of billing', () => {
  test('counts in one tile each what needs attention, with how long the oldest has waited', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createStripeBillingModel();
    model.providers.setHealth(NEEDS_ATTENTION);
    await installBillingAppMocks(page, model);

    await settings.goto();

    await expect(settings.tiles()).toBeVisible();
    const expected = {
      closeBacklog: [
        '2',
        'Periods not closed',
        'The oldest was due 3 days ago.',
      ],
      handoff: [
        '4',
        'Waiting for your accounting system',
        'The oldest was issued 10 days ago.',
      ],
      held: [
        '3',
        'Held invoices',
        'The usage journal chain is broken · Usage reports are missing from the journal',
      ],
      mismatches: [
        '1',
        'Amounts that differ, last 30 days',
        'Kaiten and the payment provider disagree on the total.',
      ],
      overdue: ['2', 'Overdue invoices', 'Unpaid past their due date.'],
      pastDue: ['1', 'Subscriptions past due', 'Their payment is late.'],
      pushFailures: ['1', 'Failed pushes', 'The oldest failed 3 hours ago.'],
    } as const;
    for (const [id, [count, label, helper]] of Object.entries(expected)) {
      const tile = settings.tile(id as keyof typeof expected);

      await expect(tile).toHaveAttribute('data-count', count);
      await expect(tile).toContainText(label);
      await expect(tile).toContainText(helper);
    }
    await expect(settings.allClear()).toHaveCount(0);
  });

  test('leads each count to what it counts: the invoices on a filter, or the queue of the accounting system', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createStripeBillingModel();
    model.providers.setHealth(NEEDS_ATTENTION);
    await installBillingAppMocks(page, model);

    await settings.goto();

    const links = {
      handoff: '/invoices?view=waiting',
      held: '/invoices?view=held',
      overdue: '/invoices?view=overdue',
      pushFailures: '/invoices?status=PUSH_FAILED',
    } as const;
    for (const [id, href] of Object.entries(links)) {
      await expect(
        settings.tile(id as keyof typeof links).getByRole('link'),
      ).toHaveAttribute('href', href);
    }
    // Nothing lists these: a figure, and no link.
    for (const id of ['mismatches', 'closeBacklog', 'pastDue'] as const) {
      await expect(settings.tile(id)).toBeVisible();
      await expect(settings.tile(id).getByRole('link')).toHaveCount(0);
    }
  });

  for (const [tile, query, chips, status] of [
    ['held', 'view=held', [], 'Held'],
    ['overdue', 'view=overdue', [], 'Overdue'],
    [
      'pushFailures',
      'status=PUSH_FAILED',
      ['Status: Push failed'],
      'Push failed',
    ],
  ] as const) {
    test(`opens the list of invoices on the view or the filter of the tile of ${tile}, with the chip that says it where it is a filter`, async ({
      page,
    }) => {
      const settings = new BillingSettingsDriver(page);
      const list = new BillingInvoicesDriver(page);
      const model = createStripeBillingModel();
      model.providers.setHealth(NEEDS_ATTENTION);
      await installBillingAppMocks(page, model);

      await settings.goto();
      await settings.tile(tile).getByRole('link').click();

      await expect(page).toHaveURL(new RegExp(`/invoices\\?${query}$`));
      await expect(
        page.getByRole('heading', { level: 1, name: 'Invoices' }),
      ).toBeVisible();
      await list.expectChips([...chips]);
      await expect(list.rows().first()).toBeVisible();
      // Every invoice listed is what the tile counts.
      const statuses = await list.statusBadges().allTextContents();
      expect(new Set(statuses.map((text) => text.trim()))).toEqual(
        new Set([status]),
      );
    });
  }

  test('opens the queue of the accounting system from the tile of what waits for it', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createStripeBillingModel();
    model.providers.setHealth(NEEDS_ATTENTION);
    await installBillingAppMocks(page, model);

    await settings.goto();
    await settings.tile('handoff').getByRole('link').click();

    await expect(page).toHaveURL(/\/invoices\?view=waiting$/);
    // The queue is a status view of the list of invoices.
    await expect(
      page.getByRole('link', { name: /^Waiting for your ERP/ }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('says all is clear in one line, instead of seven zeros, when nothing needs attention', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createStripeBillingModel();
    model.providers.setHealth(ALL_CLEAR);
    await installBillingAppMocks(page, model);

    await settings.goto();

    await expect(settings.allClear()).toContainText('All clear');
    await expect(settings.allClear()).toContainText(
      'Nothing is held, overdue or waiting, and no payment provider is out of step.',
    );
    await expect(settings.tiles()).toHaveCount(0);
  });

  test('counts, when the API is not told otherwise, what the invoices and the subscriptions make of it', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await settings.goto();

    // Held drafts and invoices past their due date are in the world; nothing failed enough times to alarm.
    for (const id of ['held', 'overdue'] as const) {
      await expect(settings.tile(id)).toHaveAttribute(
        'data-count',
        /^[1-9]\d*$/,
      );
      await expect(settings.tile(id).getByRole('link')).toBeVisible();
    }
    await expect(settings.tile('pushFailures')).toHaveAttribute(
      'data-count',
      '0',
    );
    await expect(settings.tile('pushFailures').getByRole('link')).toHaveCount(
      0,
    );
  });

  test('shows a refusal to read it with a way to ask again, and keeps the rest of the page', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createStripeBillingModel();
    model.providers.setHealth(NEEDS_ATTENTION);
    model.providers.armProblem('getBillingHealth', {
      code: 'Billing.EntitlementCheckUnavailable',
      detail: 'The billing entitlement could not be checked',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await page.goto('/settings/billing');

    await expect(settings.healthError()).toContainText(
      'The billing entitlement could not be checked',
    );
    await expect(settings.providers()).toBeVisible();
    await expect(settings.defaults()).toBeVisible();
    // The providers card does not say how the last pass went where it could not be read.
    await expect(settings.stripeSync()).toHaveCount(0);
    await settings.healthError().getByRole('button', { name: 'Retry' }).click();

    await expect(settings.tiles()).toBeVisible();
    await expect(settings.stripeSync()).toBeVisible();
  });
});

test.describe('syncing with Stripe now', () => {
  test('runs a pass without waiting for the periodic one, says how many invoices it updated and shows what Stripe said', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const writes = recordWrites(page, SYNC_WRITES, ['POST']);
    await installBillingAppMocks(page, createStripeBillingModel());

    await settings.goto();
    await settings.syncNowButton().click();

    await expectToast(
      page,
      'Synced with the payment provider: 5 invoices updated.',
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toBeNull();
    // The pass ran just now, and the card of the providers says so.
    await expect(settings.stripeSync()).toHaveText('Last synced now.');
    // `inv-pp` was paid on the hosted page: Kaiten has read the payment.
    const list = new BillingInvoicesDriver(page);
    await list.gotoShowingEverything();
    await expect(list.statusBadge('inv-pp')).toHaveText('Paid');
  });

  test("shows a refusal above the tiles in the API's words, and asks again when told to", async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createStripeBillingModel();
    model.providers.armProblem('syncBillingProvider', {
      code: 'SyncProvider.ProviderUnavailable',
      detail: 'the payment provider could not be reached',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await settings.goto();
    await settings.syncNowButton().click();

    const alert = settings.health().getByRole('alert');
    await expect(alert).toContainText(
      'the payment provider could not be reached',
    );
    await expect(alert).toContainText(
      'The payment provider could not be reached. Nothing was changed.',
    );
    await alert.getByRole('button', { name: 'Retry' }).click();

    await expectToast(
      page,
      'Synced with the payment provider: 5 invoices updated.',
    );
    await expect(alert).toHaveCount(0);
  });

  test('is a refusal too when Stripe was disconnected meanwhile', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const model = createStripeBillingModel();
    model.providers.armProblem('syncBillingProvider', {
      code: 'SyncProvider.NotConnected',
      detail: 'no payment provider that issues invoices is connected',
      status: 409,
    });
    await installBillingAppMocks(page, model);

    await settings.goto();
    await settings.syncNowButton().click();

    await expect(settings.health().getByRole('alert')).toContainText(
      'no payment provider that issues invoices is connected',
    );
  });

  test('is not offered where Stripe is not connected', async ({ page }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(
      page,
      createStripeBillingModel({ standing: 'available' }),
    );

    await settings.goto();

    await expect(settings.health()).toBeVisible();
    await expect(settings.syncNowButton()).toHaveCount(0);
  });

  test('is not offered to a session that may only read billing, which still reads the health', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.reader);
    await installBillingAppMocks(page, createStripeBillingModel());

    await settings.goto();

    await expect(settings.tiles()).toBeVisible();
    await expect(settings.syncNowButton()).toHaveCount(0);
  });
});
