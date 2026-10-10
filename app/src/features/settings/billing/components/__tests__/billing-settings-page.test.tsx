import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { BillingSettings } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetBillingHealth,
  handleGetBillingSettings,
  handleUpdateBillingSettings,
} from '@/api-client/msw.gen';
import { CLEAR_HEALTH } from '@/test-fixtures/billing-health-fixtures';
import {
  billingCapabilities,
  billingCapabilitiesProfiles,
  NO_BILLING_FEATURES,
  type StripeStanding,
} from '../../../../../../e2e/app/_support/model/billing-capabilities';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { BillingDefaultsCard } from '../billing-defaults-card';
import { BillingSettingsPageContent } from '../billing-settings-page-content';

const getAuthToken = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);

useBillingTexts();

const STORED: BillingSettings = {
  defaultCollectionMethod: 'SEND_INVOICE',
  defaultDaysUntilDue: 30,
  handoffStripeInvoices: false,
};

beforeEach(() => {
  // A session that may read and write billing and read the settings of the
  // organization, as an administrator does.
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'read:organizations', 'write:billing']),
  );
  toast.error.mockReset();
  toast.success.mockReset();
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
    handleGetBillingHealth({ body: CLEAR_HEALTH }),
    handleGetBillingSettings({ body: STORED }),
  );
});

/** Where Stripe stands for the organization, as the capabilities list it. */
function stripeIs(standing: StripeStanding) {
  server.use(
    handleGetBillingCapabilities({
      body: billingCapabilitiesProfiles.stackWithStripe(standing),
    }),
  );
}

/** Records the bodies the API is asked to store, and keeps the last as what it holds. */
function serveUpdates(answer?: (body: BillingSettings) => Response) {
  const bodies: BillingSettings[] = [];
  server.use(
    handleUpdateBillingSettings(async ({ request }) => {
      const body = (await request.json()) as BillingSettings;
      bodies.push(body);

      return answer?.(body) ?? HttpResponse.json(body);
    }),
  );

  return bodies;
}

const renderPage = () => renderWithClient(<BillingSettingsPageContent />);

const daysField = () => screen.findByLabelText(/Payment terms \(days\)/);

describe('the billing settings page', () => {
  it('says it is busy while the defaults are on the way, and shows the rest at once', async () => {
    server.use(
      handleGetBillingSettings(async () => {
        await delay('infinite');

        return HttpResponse.json(STORED);
      }),
    );
    renderPage();

    expect(
      screen.getByRole('status', { name: 'Loading the billing settings' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('billing-providers')).toBeInTheDocument();
    expect(screen.getByTestId('billing-retention')).toBeInTheDocument();
  });

  it('shows a refusal of the defaults with a way to ask again, and keeps the other cards', async () => {
    let calls = 0;
    server.use(
      handleGetBillingSettings(() => {
        calls += 1;

        return calls === 1
          ? refusal(503, { detail: 'Billing settings are unavailable' })
          : HttpResponse.json(STORED);
      }),
    );
    renderPage();

    const problem = await screen.findByTestId('billing-settings-error');
    expect(problem).toHaveTextContent('Billing settings are unavailable');
    expect(screen.getByTestId('billing-providers')).toBeInTheDocument();
    await userEvent.click(within(problem).getByRole('button', { name: 'Retry' }));

    expect(await daysField()).toHaveValue('30');
  });
});

describe('the providers', () => {
  it('says there is nothing to connect for NoOp, and leads to the handoff queue', async () => {
    renderPage();

    const noop = await screen.findByTestId('billing-provider-noop');
    expect(noop).toHaveTextContent('Manual hand-off');
    expect(noop).toHaveTextContent('Nothing to connect.');
    // The scopes of the session are read from its token, which takes a moment.
    expect(
      await within(noop).findByRole('link', { name: 'Open the handoff queue' }),
    ).toHaveAttribute('href', '/invoices?view=waiting');
    expect(screen.queryByTestId('billing-provider-stripe')).toBeNull();
  });

  it('offers no way to the queue to a session that may not read it', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:instances']));
    renderPage();

    await screen.findByTestId('billing-provider-noop');
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Open the handoff queue' })).toBeNull(),
    );
  });

  it('lists Stripe as connected to a test account, and leads to its connector', async () => {
    stripeIs('connected');
    renderPage();

    const stripe = await screen.findByTestId('billing-provider-stripe');
    expect(stripe).toHaveTextContent('Stripe');
    expect(stripe).toHaveTextContent('Connected');
    expect(stripe).toHaveTextContent('Test mode');
    expect(stripe).toHaveAttribute('data-standing', 'connected');
    expect(
      await within(stripe).findByRole('link', { name: 'Manage the connection' }),
    ).toHaveAttribute('href', '/integrations/connectors/stripe');
  });

  it('says when the connection reaches the live account', async () => {
    stripeIs('connectedLive');
    renderPage();

    const stripe = await screen.findByTestId('billing-provider-stripe');
    expect(await within(stripe).findByText('Live mode')).toHaveAttribute(
      'data-mode',
      'live',
    );
  });

  it('offers to connect Stripe where it can be and is not', async () => {
    stripeIs('available');
    renderPage();

    const stripe = await screen.findByTestId('billing-provider-stripe');
    expect(stripe).toHaveTextContent('Not connected');
    expect(stripe).toHaveAttribute('data-standing', 'available');
    expect(
      await within(stripe).findByRole('link', { name: 'Connect Stripe' }),
    ).toHaveAttribute('href', '/integrations/connectors/stripe');
    expect(within(stripe).queryByTestId('billing-provider-sync')).toBeNull();
  });

  it.each([
    ['vaultMissing', 'VAULT_NOT_CONFIGURED', 'Needs a Vault to store the key in'],
    ['notEntitled', 'NOT_ENTITLED', 'Not included in your plan.'],
  ] as const)(
    'says why Stripe cannot be connected here (%s), and leads to the page that explains',
    async (standing, reason, words) => {
      stripeIs(standing);
      renderPage();

      const stripe = await screen.findByTestId('billing-provider-stripe');
      expect(stripe).toHaveTextContent('Unavailable');
      expect(stripe).toHaveAttribute('data-standing', 'unavailable');
      expect(stripe.querySelector(`[data-reason="${reason}"]`)).toHaveTextContent(
        words,
      );
      expect(
        await within(stripe).findByRole('link', { name: 'See why' }),
      ).toBeInTheDocument();
    },
  );

  it('does not send a session that may not read the settings of the organization to the connector', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    stripeIs('connected');
    renderPage();

    const stripe = await screen.findByTestId('billing-provider-stripe');
    await waitFor(() => expect(stripe).toHaveTextContent('Connected'));
    expect(within(stripe).queryByRole('link')).toBeNull();
  });

  it('lists Stripe whenever the API lists it, whatever the flags of the capabilities say', async () => {
    // The API answers `stripe: false` here, and lists the provider all the same.
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilities({
          features: NO_BILLING_FEATURES,
          providers: [
            ...billingCapabilitiesProfiles.stack().providers,
            ...billingCapabilitiesProfiles
              .stackWithStripe('connected')
              .providers.filter(({ kind }) => kind === 'STRIPE'),
          ],
        }),
      }),
    );
    renderPage();

    const stripe = await screen.findByTestId('billing-provider-stripe');
    expect(stripe).toHaveTextContent('Connected');
  });

  it('does not list a Stripe the API does not list', async () => {
    renderPage();

    await screen.findByTestId('billing-provider-noop');
    expect(screen.queryByTestId('billing-provider-stripe')).toBeNull();
  });
});

describe('the defaults', () => {
  it('opens on what the organization has', async () => {
    renderPage();

    expect(await daysField()).toHaveValue('30');
    expect(screen.getByRole('combobox')).toHaveTextContent('Send the invoice');
  });

  it('keeps charging automatically on the list, disabled, with why', async () => {
    renderPage();
    await daysField();

    await userEvent.click(screen.getByRole('combobox'));

    const option = await screen.findByRole('option', {
      name: 'Charge automatically (needs a payment provider)',
    });
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('option', { name: 'Send the invoice' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('keeps charging automatically off as a default once a connected provider charges by itself, and points to the contract', async () => {
    stripeIs('connected');
    renderPage();
    await daysField();

    await userEvent.click(screen.getByRole('combobox'));

    expect(
      await screen.findByRole('option', {
        name: 'Charge automatically (set on each contract)',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps charging automatically off while Stripe is only free to be connected', async () => {
    stripeIs('available');
    renderPage();
    await daysField();

    await userEvent.click(screen.getByRole('combobox'));

    expect(
      await screen.findByRole('option', {
        name: 'Charge automatically (needs a payment provider)',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('asks whether to hand Stripe invoices off once Stripe can be used, and not before', async () => {
    const { unmount } = renderPage();
    await daysField();
    expect(screen.queryByLabelText('Hand off Stripe invoices')).toBeNull();
    unmount();

    stripeIs('vaultMissing');
    const unusable = renderPage();
    await daysField();
    expect(screen.queryByLabelText('Hand off Stripe invoices')).toBeNull();
    unusable.unmount();

    stripeIs('available');
    renderPage();

    expect(await screen.findByLabelText('Hand off Stripe invoices')).not.toBeChecked();
  });

  it('cannot be saved before it is changed', async () => {
    renderPage();
    await daysField();

    expect(screen.getByRole('button', { name: /Save the defaults|Fill in/ })).toBeDisabled();
  });

  it('replaces the three members, saves them, says so, and opens again on what the API kept', async () => {
    const bodies = serveUpdates();
    renderPage();
    const days = await daysField();

    await userEvent.clear(days);
    await userEvent.type(days, '45');
    await userEvent.click(screen.getByRole('button', { name: 'Save the defaults' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      defaultCollectionMethod: 'SEND_INVOICE',
      defaultDaysUntilDue: 45,
      handoffStripeInvoices: false,
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Billing defaults saved'),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save the defaults' })).toBeDisabled(),
    );
  });

  it('sends the member it does not show as it is stored', async () => {
    server.use(
      handleGetBillingSettings({ body: { ...STORED, handoffStripeInvoices: true } }),
    );
    const bodies = serveUpdates();
    renderPage();
    const days = await daysField();
    expect(screen.queryByLabelText('Hand off Stripe invoices')).toBeNull();

    await userEvent.clear(days);
    await userEvent.type(days, '7');
    await userEvent.click(screen.getByRole('button', { name: 'Save the defaults' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].handoffStripeInvoices).toBe(true);
  });

  it('tells a number that is no number of days before it asks', async () => {
    const bodies = serveUpdates();
    renderPage();
    const days = await daysField();

    await userEvent.clear(days);

    expect(
      await screen.findByText('Enter a whole number of days, from 0 to 365'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fill in|Save/ })).toBeDisabled();
    expect(bodies).toHaveLength(0);
  });

  it('shows a refusal about a field on that field, and keeps what was typed', async () => {
    serveUpdates(() =>
      refusal(422, {
        code: 'UpdateBillingSettings.InvalidDaysUntilDue',
        detail: 'defaultDaysUntilDue is between 0 and 365',
      }),
    );
    renderPage();
    const days = await daysField();

    await userEvent.clear(days);
    await userEvent.type(days, '45');
    await userEvent.click(screen.getByRole('button', { name: 'Save the defaults' }));

    expect(
      await screen.findByText('defaultDaysUntilDue is between 0 and 365'),
    ).toBeInTheDocument();
    expect(days).toHaveValue('45');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows any other refusal above the button, with a way to ask again', async () => {
    let calls = 0;
    const bodies = serveUpdates((body) => {
      calls += 1;

      return calls === 1
        ? refusal(503, { detail: 'The settings store is down' })
        : HttpResponse.json(body);
    });
    renderPage();
    const days = await daysField();
    await userEvent.clear(days);
    await userEvent.type(days, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save the defaults' }));

    const alert = await screen.findByText('The settings store is down');
    expect(days).toHaveValue('10');
    await userEvent.click(
      within(alert.closest('[role="alert"]') as HTMLElement).getByRole('button', {
        name: 'Retry',
      }),
    );

    await waitFor(() => expect(bodies).toHaveLength(2));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Billing defaults saved'),
    );
  });

  it('shows the defaults and no way to save them to a session that may only read', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    renderPage();

    const days = await daysField();
    await waitFor(() => expect(days).toBeDisabled());
    expect(screen.getByTestId('billing-defaults-read-only')).toHaveTextContent(
      'Your session can read these defaults but not change them.',
    );
    expect(screen.queryByRole('button', { name: 'Save the defaults' })).toBeNull();
  });
});

describe('the defaults, before the scopes of the session are known', () => {
  it('does not call itself read-only while the token is being read, then lets a writer save', async () => {
    let release: (token: string) => void = () => {};
    getAuthToken.mockReturnValue(
      new Promise<string>((resolve) => {
        release = resolve;
      }),
    );
    // The card is given the defaults, so that nothing but the token is awaited.
    renderWithClient(<BillingDefaultsCard settings={STORED} />);

    const days = await daysField();
    expect(days).toBeDisabled();
    expect(screen.queryByTestId('billing-defaults-read-only')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Save the defaults' }),
    ).toBeNull();

    release(sessionToken(['read:billing', 'write:billing']));

    await waitFor(() => expect(days).toBeEnabled());
    expect(
      await screen.findByRole('button', { name: 'Save the defaults' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('billing-defaults-read-only')).toBeNull();
  });
});

describe('the retention', () => {
  it('says how many months usage is kept, and how long a transaction id is remembered', async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId('billing-retention-months')).toHaveTextContent(
        'Usage reports are kept for 18 months.',
      ),
    );
    expect(screen.getByTestId('billing-retention')).toHaveTextContent(
      'ignored for 35 days',
    );
  });

  it('says no limit is reported when the deployment gives none', async () => {
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilities({ usageHistoryRetentionMonths: null }),
      }),
    );
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId('billing-retention-months')).toHaveTextContent(
        'No time limit is reported',
      ),
    );
  });
});
