import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { BillingHealth, SyncReport } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetBillingHealth,
  handleSyncBillingProvider,
} from '@/api-client/msw.gen';
import {
  CLEAR_HEALTH,
  healthWith,
  syncedStripe,
} from '@/test-fixtures/billing-health-fixtures';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import {
  billingCapabilitiesProfiles,
  type StripeStanding,
} from '../../../../../../e2e/app/_support/model/billing-capabilities';
import { BillingHealthCard } from '../billing-health-card';
import { BillingProvidersCard } from '../billing-providers-card';

const getAuthToken = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);

useBillingTexts();

const ALL_SCOPES = [
  'read:billing',
  'read:organizations',
  'write:billing',
] as const;

beforeEach(() => {
  getAuthToken.mockResolvedValue(sessionToken([...ALL_SCOPES]));
  toast.error.mockReset();
  toast.success.mockReset();
  toast.warning.mockReset();
  serveHealth(CLEAR_HEALTH);
  stripeIs('connected');
});

function stripeIs(standing: StripeStanding) {
  server.use(
    handleGetBillingCapabilities({
      body: billingCapabilitiesProfiles.stackWithStripe(standing),
    }),
  );
}

/** Answers every read of the health with the next of `states`, the last one for good; records how many reads. */
function serveHealth(...states: BillingHealth[]) {
  const reads = { count: 0 };
  server.use(
    handleGetBillingHealth(() => {
      reads.count += 1;

      return HttpResponse.json(states[Math.min(reads.count, states.length) - 1]);
    }),
  );

  return reads;
}

function serveSync(answer: () => Response | SyncReport) {
  const calls = { count: 0 };
  server.use(
    handleSyncBillingProvider(() => {
      calls.count += 1;
      const answered = answer();

      return answered instanceof Response
        ? answered
        : HttpResponse.json(answered, { status: 202 });
    }),
  );

  return calls;
}

const outcome = (
  overrides: Partial<SyncReport['providers'][number]> = {},
): SyncReport['providers'][number] => ({
  applied: 0,
  failed: 0,
  providerKind: 'STRIPE',
  status: 'SUCCESS',
  syncedAt: '2027-03-01T10:00:00Z',
  ...overrides,
});

const NEEDS_ATTENTION = healthWith({
  closeBacklog: { count: 2, oldestDueAt: '2020-01-01T00:00:00Z' },
  handoff: { oldestPendingIssuedAt: '2020-01-02T00:00:00Z', pending: 4 },
  heldInvoices: {
    byReason: {
      LEDGER_CHAIN_BREAK: 0,
      LEDGER_COUNTER_MISMATCH: 0,
      LEDGER_SEQUENCE_GAP: 3,
    },
    count: 3,
  },
  overdueInvoices: 5,
  pastDueSubscriptions: 1,
  pushFailures: { count: 2, oldestFailedAt: '2020-01-03T00:00:00Z' },
  reconciliationMismatches30d: 6,
});

const tile = (id: string) => screen.findByTestId(`billing-health-${id}`);

describe('the health of billing', () => {
  it('says it is busy while the counts are on the way', async () => {
    server.use(
      handleGetBillingHealth(async () => {
        await delay('infinite');

        return HttpResponse.json(CLEAR_HEALTH);
      }),
    );
    renderWithClient(<BillingHealthCard />);

    expect(
      await screen.findByRole('status', { name: 'Loading the health of billing' }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('says all is clear, in place of seven zeros, when nothing needs attention', async () => {
    renderWithClient(<BillingHealthCard />);

    expect(await screen.findByTestId('billing-health-clear')).toHaveTextContent(
      'All clear',
    );
    expect(screen.queryByTestId('billing-health-tiles')).toBeNull();
  });

  it('shows one tile for each thing it counts, in the order a person reads them, once one is not zero', async () => {
    serveHealth(NEEDS_ATTENTION);
    renderWithClient(<BillingHealthCard />);

    const tiles = await screen.findByTestId('billing-health-tiles');
    await waitFor(() =>
      expect(
        [...tiles.querySelectorAll('[data-testid^="billing-health-"]')].map(
          (element) => element.getAttribute('data-testid'),
        ),
      ).toEqual([
        'billing-health-held',
        'billing-health-pushFailures',
        'billing-health-overdue',
        'billing-health-handoff',
        'billing-health-mismatches',
        'billing-health-closeBacklog',
        'billing-health-pastDue',
      ]),
    );
  });

  it('counts each, and leads the ones something lists to it', async () => {
    serveHealth(NEEDS_ATTENTION);
    renderWithClient(<BillingHealthCard />);

    const held = await tile('held');
    expect(held).toHaveAttribute('data-count', '3');
    expect(
      await within(held).findByRole('link', { name: 'Held invoices' }),
    ).toHaveAttribute('href', '/billing/invoices?held=true');
    expect(
      within(await tile('pushFailures')).getByRole('link', {
        name: 'Failed pushes',
      }),
    ).toHaveAttribute('href', '/billing/invoices?status=PUSH_FAILED');
    expect(
      within(await tile('overdue')).getByRole('link', {
        name: 'Overdue invoices',
      }),
    ).toHaveAttribute('href', '/billing/invoices?overdue=true');
    expect(
      within(await tile('handoff')).getByRole('link', {
        name: 'Waiting for your accounting system',
      }),
    ).toHaveAttribute('href', '/billing/handoff');
  });

  it('shows a count that nothing lists as a figure and no link', async () => {
    serveHealth(NEEDS_ATTENTION);
    renderWithClient(<BillingHealthCard />);

    for (const [id, count] of [
      ['mismatches', '6'],
      ['closeBacklog', '2'],
      ['pastDue', '1'],
    ] as const) {
      const figure = await tile(id);
      expect(figure).toHaveAttribute('data-count', count);
      expect(within(figure).queryByRole('link')).toBeNull();
    }
  });

  it('leads a zero nowhere, since there would be nothing to see', async () => {
    serveHealth(healthWith({ overdueInvoices: 2 }));
    renderWithClient(<BillingHealthCard />);

    const held = await tile('held');
    expect(held).toHaveAttribute('data-count', '0');
    await within(await tile('overdue')).findByRole('link');
    expect(within(held).queryByRole('link')).toBeNull();
  });

  it('says why invoices are held, with the words of each check', async () => {
    serveHealth(NEEDS_ATTENTION);
    renderWithClient(<BillingHealthCard />);

    expect(await tile('held')).toHaveTextContent(
      'Usage reports are missing from the journal',
    );
  });

  it('says how long the oldest of what waits has waited', async () => {
    serveHealth(NEEDS_ATTENTION);
    renderWithClient(<BillingHealthCard />);

    expect(await tile('pushFailures')).toHaveTextContent(/The oldest failed .+ ago/);
    expect(await tile('handoff')).toHaveTextContent(
      /The oldest was issued .+ ago/,
    );
    expect(await tile('closeBacklog')).toHaveTextContent(
      /The oldest was due .+ ago/,
    );
  });

  it('is not shown to a session that may not read the health', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:instances']));
    const { container } = renderWithClient(<BillingHealthCard />);

    await waitFor(() => expect(getAuthToken).toHaveBeenCalled());
    await waitFor(() =>
      expect(container.querySelector('[data-testid="billing-health"]')).toBeNull(),
    );
  });

  it('shows a refusal in the API\'s words, with a way to ask again', async () => {
    let reads = 0;
    server.use(
      handleGetBillingHealth(() => {
        reads += 1;

        return reads === 1
          ? refusal(503, { detail: 'The health of billing is unavailable' })
          : HttpResponse.json(CLEAR_HEALTH);
      }),
    );
    renderWithClient(<BillingHealthCard />);

    const problem = await screen.findByTestId('billing-health-error');
    expect(problem).toHaveTextContent('The health of billing is unavailable');
    await userEvent.click(within(problem).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByTestId('billing-health-clear')).toBeInTheDocument();
  });
});

describe('syncing with the payment provider now', () => {
  const syncNow = () => screen.findByRole('button', { name: 'Sync now' });

  it('is offered where a payment provider is connected and the session may write billing', async () => {
    renderWithClient(<BillingHealthCard />);

    expect(await syncNow()).toBeEnabled();
  });

  it.each(['available', 'vaultMissing', 'notEntitled'] as const)(
    'is not offered where Stripe is %s: there is nothing to sync with',
    async (standing) => {
      stripeIs(standing);
      renderWithClient(<BillingHealthCard />);

      await screen.findByTestId('billing-health-clear');
      expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
    },
  );

  it('is not offered to a session that may read billing and not write it', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    renderWithClient(<BillingHealthCard />);

    await screen.findByTestId('billing-health-clear');
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
  });

  it('asks the API to run the pass, says how many invoices it changed, and reads the health again', async () => {
    const reads = serveHealth(NEEDS_ATTENTION, CLEAR_HEALTH);
    const calls = serveSync(() => ({ providers: [outcome({ applied: 2 })] }));
    renderWithClient(<BillingHealthCard />);

    await tile('overdue');
    await userEvent.click(await syncNow());

    await waitFor(() => expect(calls.count).toBe(1));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Synced with the payment provider: 2 invoices updated.',
      ),
    );
    // What the pass changed is counted again.
    expect(await screen.findByTestId('billing-health-clear')).toBeInTheDocument();
    expect(reads.count).toBe(2);
  });

  it('says that nothing had changed when nothing had', async () => {
    serveSync(() => ({ providers: [outcome()] }));
    renderWithClient(<BillingHealthCard />);

    await userEvent.click(await syncNow());

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Synced with the payment provider. Nothing had changed.',
      ),
    );
  });

  it('warns when invoices could not be applied, with the words of the API', async () => {
    serveSync(() => ({
      providers: [
        outcome({
          applied: 1,
          error: 'could not apply in_9',
          failed: 1,
          status: 'PARTIAL',
        }),
      ],
    }));
    renderWithClient(<BillingHealthCard />);

    await userEvent.click(await syncNow());

    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        'Synced with the payment provider, with problems.',
        { description: 'could not apply in_9' },
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('says so when the pass failed', async () => {
    serveSync(() => ({
      providers: [
        outcome({
          error: 'the payment provider could not be reached',
          status: 'FAILED',
        }),
      ],
    }));
    renderWithClient(<BillingHealthCard />);

    await userEvent.click(await syncNow());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The sync with the payment provider failed.',
        { description: 'the payment provider could not be reached' },
      ),
    );
  });

  it('shows a refusal above the figures, in the API\'s words, and keeps the button', async () => {
    serveSync(() =>
      refusal(409, {
        code: 'SyncProvider.NotConnected',
        detail: 'no payment provider that issues invoices is connected',
      }),
    );
    renderWithClient(<BillingHealthCard />);

    await userEvent.click(await syncNow());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'no payment provider that issues invoices is connected',
    );
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('offers to ask again when the provider cannot be reached, and syncs when it can', async () => {
    let calls = 0;
    serveSync(() => {
      calls += 1;

      return calls === 1
        ? refusal(503, {
            code: 'SyncProvider.ProviderUnavailable',
            detail: 'the payment provider could not be reached',
          })
        : { providers: [outcome({ applied: 1 })] };
    });
    renderWithClient(<BillingHealthCard />);

    await userEvent.click(await syncNow());
    const alert = await screen.findByRole('alert');
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(calls).toBe(2));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Synced with the payment provider: 1 invoice updated.',
      ),
    );
  });

  it('is busy, and cannot be pressed again, while the pass runs', async () => {
    server.use(
      handleSyncBillingProvider(async () => {
        await delay('infinite');

        return HttpResponse.json({ providers: [] }, { status: 202 });
      }),
    );
    renderWithClient(<BillingHealthCard />);

    await userEvent.click(await syncNow());

    expect(await screen.findByRole('button', { name: 'Syncing…' })).toBeDisabled();
  });
});

describe('how the last pass of Stripe went, under its name', () => {
  const line = () => screen.findByTestId('billing-provider-sync');

  it('says when Stripe was last read', async () => {
    serveHealth(healthWith({ providerSync: [syncedStripe()] }));
    renderWithClient(<BillingProvidersCard />);

    const sync = await line();
    expect(sync).toHaveAttribute('data-standing', 'ok');
    expect(sync).toHaveTextContent(/Last synced .+ ago\./);
  });

  it('warns when the passes keep failing, with how many and what the last said', async () => {
    serveHealth(
      healthWith({
        providerSync: [
          syncedStripe({
            consecutiveFailures: 3,
            lastSyncError: 'the payment provider could not be reached',
            lastSyncStatus: 'FAILED',
          }),
        ],
      }),
    );
    renderWithClient(<BillingProvidersCard />);

    const sync = await line();
    expect(sync).toHaveAttribute('data-standing', 'failing');
    expect(sync).toHaveTextContent(/3 syncs in a row failed\. The last was .+ ago\./);
    expect(sync).toHaveTextContent(
      'Last error: the payment provider could not be reached',
    );
  });

  it('says a single failure in the singular', async () => {
    serveHealth(
      healthWith({
        providerSync: [
          syncedStripe({ consecutiveFailures: 1, lastSyncStatus: 'FAILED' }),
        ],
      }),
    );
    renderWithClient(<BillingProvidersCard />);

    expect(await line()).toHaveTextContent(/The last sync failed .+ ago\./);
  });

  it('warns when a pass left invoices it could not apply', async () => {
    serveHealth(
      healthWith({
        providerSync: [
          syncedStripe({
            lastSyncError: 'could not apply in_1',
            lastSyncStatus: 'PARTIAL',
          }),
        ],
      }),
    );
    renderWithClient(<BillingProvidersCard />);

    const sync = await line();
    expect(sync).toHaveAttribute('data-standing', 'partial');
    expect(sync).toHaveTextContent('some invoices could not be applied');
  });

  it('says that Stripe has not been read yet', async () => {
    serveHealth(healthWith({ providerSync: [] }));
    renderWithClient(<BillingProvidersCard />);

    expect(await line()).toHaveAttribute('data-standing', 'never');
  });

  it('is not shown where Stripe is not connected: there is no pass to report', async () => {
    stripeIs('available');
    serveHealth(healthWith({ providerSync: [syncedStripe()] }));
    renderWithClient(<BillingProvidersCard />);

    await screen.findByTestId('billing-provider-stripe');
    expect(screen.queryByTestId('billing-provider-sync')).toBeNull();
  });

  it('is not shown to a session that may not read the health', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:organizations']));
    serveHealth(healthWith({ providerSync: [syncedStripe()] }));
    renderWithClient(<BillingProvidersCard />);

    await screen.findByTestId('billing-provider-stripe');
    await waitFor(() => expect(getAuthToken).toHaveBeenCalled());
    expect(screen.queryByTestId('billing-provider-sync')).toBeNull();
  });
});
