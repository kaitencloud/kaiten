import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type {
  ConnectorSettings,
  ConnectorSettingsWritable,
} from '@/api-client';
import {
  handleDeactivateConnector,
  handleGetBillingCapabilities,
  handleUpdateConnectorSettings,
} from '@/api-client/msw.gen';
import { STRIPE_CONNECTOR_NAME } from '@/domains/billing';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import {
  billingCapabilitiesProfiles,
  type StripeStanding,
} from '../../../../../e2e/app/_support/model/billing-capabilities';
import { StripeConnectorDetail } from './stripe-connector-detail';

const getAuthToken = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));

useBillingTexts();

/** What the API holds of a connected Stripe: the key is never returned, only `***`. */
const stored = (
  settings: Record<string, unknown> = {},
): ConnectorSettings => ({
  connector_name: STRIPE_CONNECTOR_NAME,
  settings: {
    autoFinalize: true,
    automaticTax: false,
    stripeSecretKey: '***',
    taxBehavior: 'EXCLUSIVE',
    ...settings,
  },
});

beforeEach(() => {
  // A session that may write the settings of the organization, as an administrator does.
  getAuthToken.mockResolvedValue(
    sessionToken(['read:organizations', 'write:organizations']),
  );
  toast.error.mockReset();
  toast.success.mockReset();
});

/** Where Stripe stands for the organization, as the capabilities list it. */
function standing(state: StripeStanding) {
  server.use(
    handleGetBillingCapabilities({
      body: billingCapabilitiesProfiles.stackWithStripe(state),
    }),
  );
}

type Save = { body: ConnectorSettingsWritable; connectorName: string };

/** Records what the page asks the API to store, and answers it, or refuses as told. */
function serveSaves(refuse?: (calls: number) => Response | undefined) {
  const saves: Save[] = [];
  server.use(
    handleUpdateConnectorSettings(async ({ params, request }) => {
      const body = (await request.json()) as ConnectorSettingsWritable;
      saves.push({ body, connectorName: params.connectorName });
      const refused = refuse?.(saves.length);
      if (refused) {
        return refused;
      }

      return HttpResponse.json({
        connector_name: params.connectorName,
        settings: { ...body.settings, stripeSecretKey: '***' },
      });
    }),
  );

  return saves;
}

const keyField = () => screen.findByLabelText(/Restricted API key/);

/** The page knows where Stripe stands and what the session may only a moment after it opens. */
async function typeKey(key: string) {
  const field = await keyField();
  await waitFor(() => expect(field).toBeEnabled());
  await userEvent.clear(field);
  await userEvent.type(field, key);

  return field;
}

describe('connecting Stripe', () => {
  it('asks for a restricted key, hides it as it is typed and offers to connect once it is one', async () => {
    standing('available');
    const saves = serveSaves();
    renderWithClient(<StripeConnectorDetail stripeSettings={null} />);

    const field = await keyField();
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAttribute('autocomplete', 'off');
    expect(field).toHaveAttribute('placeholder', 'rk_test_…');
    const connect = await screen.findByRole('button', { name: 'Connect Stripe' });
    expect(connect).toBeDisabled();

    await userEvent.type(field, 'rk_live_key');
    expect(
      screen.getByText('This key reaches a Stripe account in Live mode.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(connect).toBeEnabled());
    await userEvent.click(connect);

    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toEqual({
      body: {
        settings: {
          autoFinalize: true,
          automaticTax: false,
          stripeSecretKey: 'rk_live_key',
          taxBehavior: 'EXCLUSIVE',
        },
      },
      connectorName: STRIPE_CONNECTOR_NAME,
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Stripe connected.'),
    );
    // The key was typed once: the field is emptied, and nothing else keeps it.
    await waitFor(() => expect(field).toHaveValue(''));
  });

  it('refuses a secret key, and says why, before anything is sent', async () => {
    standing('available');
    const saves = serveSaves();
    renderWithClient(<StripeConnectorDetail stripeSettings={null} />);

    const field = await typeKey('sk_live_key');

    expect(
      await screen.findByText(
        'Use a restricted key (rk_…): a secret key (sk_…) gives Kaiten access to far more than it needs.',
      ),
    ).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Connect Stripe' })).toBeDisabled();
    expect(saves).toHaveLength(0);
  });

  it('refuses a publishable key, and a key that is not shaped like one', async () => {
    standing('available');
    renderWithClient(<StripeConnectorDetail stripeSettings={null} />);

    await typeKey('pk_test_key');
    expect(
      await screen.findByText(
        'A publishable key (pk_…) cannot create invoices. Use a restricted key (rk_…).',
      ),
    ).toBeInTheDocument();

    await typeKey('hello');
    expect(
      await screen.findByText(
        'A restricted key starts with rk_test_ or rk_live_, followed by letters and digits.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the credentials Stripe rejects on the key, in its words, and keeps what was typed', async () => {
    standing('available');
    serveSaves(() =>
      refusal(422, {
        code: 'UpdateConnectorSettings.CredentialsRejected',
        detail:
          'the payment provider refused the credentials: Invalid API Key provided',
        errors: [
          {
            location: 'body.settings.stripeSecretKey',
            message: 'provider error',
            value: { providerCode: 'api_key_expired' },
          },
        ],
      }),
    );
    renderWithClient(<StripeConnectorDetail stripeSettings={null} />);

    const field = await typeKey('rk_test_key');
    await userEvent.click(screen.getByRole('button', { name: 'Connect Stripe' }));

    expect(
      await screen.findByText(
        'the payment provider refused the credentials: Invalid API Key provided',
      ),
    ).toBeInTheDocument();
    expect(field).toHaveValue('rk_test_key');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows an account that changed above the button, with what was typed kept', async () => {
    standing('connected');
    serveSaves(() =>
      refusal(409, {
        code: 'UpdateConnectorSettings.AccountChanged',
        detail:
          "the new key reaches another account than the one this organization's customers live in",
      }),
    );
    renderWithClient(<StripeConnectorDetail stripeSettings={stored()} />);

    const field = await typeKey('rk_live_key');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      "the new key reaches another account than the one this organization's customers live in",
    );
    expect(alert).toHaveAttribute('data-kind', 'generic');
    expect(field).toHaveValue('rk_live_key');
    expect(field).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('says that Stripe cannot be reached, offers to ask again, and connects when it can', async () => {
    standing('available');
    const saves = serveSaves((calls) =>
      calls === 1
        ? refusal(503, {
            code: 'UpdateConnectorSettings.ProviderUnavailable',
            detail:
              'the payment provider could not be reached to check the credentials; retry in a moment',
          })
        : undefined,
    );
    renderWithClient(<StripeConnectorDetail stripeSettings={null} />);

    await typeKey('rk_test_key');
    await userEvent.click(screen.getByRole('button', { name: 'Connect Stripe' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-kind', 'transient');
    expect(alert).toHaveTextContent(
      'the payment provider could not be reached to check the credentials',
    );
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(saves).toHaveLength(2));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Stripe connected.'),
    );
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('shows a settings schema failure, which locates nothing, above the button in the API\'s words', async () => {
    standing('available');
    serveSaves(() =>
      refusal(422, {
        code: 'UpdateConnectorSettings.InvalidPayloadSchema',
        detail: 'Connector settings payload does not match schema',
      }),
    );
    renderWithClient(<StripeConnectorDetail stripeSettings={null} />);

    await typeKey('rk_test_key');
    await userEvent.click(screen.getByRole('button', { name: 'Connect Stripe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Connector settings payload does not match schema',
    );
  });

  it('connects again with the key it still holds, without asking for it', async () => {
    standing('available');
    const saves = serveSaves();
    renderWithClient(<StripeConnectorDetail stripeSettings={stored()} />);

    const field = await keyField();
    expect(field).toHaveAttribute(
      'placeholder',
      'Key set — enter a new key to replace it',
    );
    const reconnect = await screen.findByRole('button', {
      name: 'Connect Stripe with the stored key',
    });
    await waitFor(() => expect(reconnect).toBeEnabled());
    await userEvent.click(reconnect);

    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]?.body.settings).toEqual({
      autoFinalize: true,
      automaticTax: false,
      taxBehavior: 'EXCLUSIVE',
    });
    expect(saves[0]?.body.settings).not.toHaveProperty('stripeSecretKey');
  });
});

describe('a connected Stripe', () => {
  it('says which account it reaches, and links to the dashboard of that account', async () => {
    standing('connected');
    renderWithClient(<StripeConnectorDetail stripeSettings={stored()} />);

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Test mode')).toHaveAttribute('data-mode', 'test');
    expect(screen.getByRole('link', { name: 'Open in Stripe' })).toHaveAttribute(
      'href',
      'https://dashboard.stripe.com/test',
    );
    expect(await keyField()).toHaveAttribute(
      'placeholder',
      'Key set (Test mode) — enter a new key to replace it',
    );
  });

  it('marks a live account as such', async () => {
    standing('connectedLive');
    renderWithClient(<StripeConnectorDetail stripeSettings={stored()} />);

    expect(await screen.findByText('Live mode')).toHaveAttribute(
      'data-mode',
      'live',
    );
    expect(screen.getByRole('link', { name: 'Open in Stripe' })).toHaveAttribute(
      'href',
      'https://dashboard.stripe.com',
    );
  });

  it('opens on the options as they are stored', async () => {
    standing('connected');
    renderWithClient(
      <StripeConnectorDetail
        stripeSettings={stored({
          autoFinalize: false,
          automaticTax: true,
          taxBehavior: 'INCLUSIVE',
        })}
      />,
    );

    expect(await screen.findByLabelText('Compute tax automatically')).toBeChecked();
    expect(screen.getByLabelText('Finalize invoices automatically')).not.toBeChecked();
    expect(screen.getByRole('combobox')).toHaveTextContent('Amounts include tax');
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('saves the options without the key, which keeps the stored one', async () => {
    standing('connected');
    const saves = serveSaves();
    renderWithClient(<StripeConnectorDetail stripeSettings={stored()} />);

    await userEvent.click(await screen.findByLabelText('Compute tax automatically'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]?.body).toEqual({
      settings: {
        autoFinalize: true,
        automaticTax: true,
        taxBehavior: 'EXCLUSIVE',
      },
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Stripe settings saved.'),
    );
  });

  it('replaces the key when a new one is typed, and checks it', async () => {
    standing('connected');
    const saves = serveSaves();
    renderWithClient(<StripeConnectorDetail stripeSettings={stored()} />);

    await typeKey('sk_live_key');
    expect(await screen.findByText(/Use a restricted key/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await typeKey('rk_live_key');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]?.body.settings).toMatchObject({
      stripeSecretKey: 'rk_live_key',
    });
  });

  it('lists what Kaiten owns, what Stripe owns and the permissions the key needs', async () => {
    standing('connected');
    renderWithClient(<StripeConnectorDetail stripeSettings={stored()} />);

    const overview = await screen.findByTestId('stripe-overview');
    expect(overview).toHaveTextContent('Kaiten owns');
    expect(overview).toHaveTextContent('Stripe owns');
    expect(overview).toHaveTextContent('Invoice numbers');
    const permissions = within(screen.getByTestId('stripe-permissions'));
    expect(permissions.getByText('Invoices: write')).toBeInTheDocument();
    expect(permissions.getByText('Events: read')).toBeInTheDocument();
  });
});

describe('disconnecting Stripe', () => {
  it('asks first, turns it off and says so', async () => {
    standing('connected');
    const disconnected: string[] = [];
    server.use(
      handleDeactivateConnector(({ params }) => {
        disconnected.push(params.connectorName);

        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithClient(<StripeConnectorDetail stripeSettings={stored()} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Disconnect Stripe?');
    expect(disconnected).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => expect(disconnected).toEqual([STRIPE_CONNECTOR_NAME]));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Stripe disconnected.'),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('stays open while billing still uses Stripe, and counts what holds it', async () => {
    standing('connected');
    server.use(
      handleDeactivateConnector(() =>
        refusal(409, {
          code: 'DeactivateConnector.BillingActive',
          detail:
            'subscriptions or unsettled invoices still route to this payment provider; cancel or switch them, and settle the invoices, first',
          errors: [
            {
              location: 'connector',
              message: 'still routing',
              value: { activeSubscriptions: 2, openInvoices: 1 },
            },
          ],
        }),
      ),
    );
    renderWithClient(<StripeConnectorDetail stripeSettings={stored()} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    const refused = await within(dialog).findByTestId('stripe-disconnect-refused');
    expect(refused).toHaveTextContent('still route to this payment provider');
    const routing = within(within(refused).getByTestId('stripe-routing'));
    expect(
      routing.getByText(
        '2 subscriptions that are not canceled are still collected through Stripe.',
      ),
    ).toBeInTheDocument();
    expect(
      routing.getByText('1 invoice that is not settled is still in Stripe.'),
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // Closing the dialog takes the refusal with it: it is asked afresh next time.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(
      within(await screen.findByRole('alertdialog')).queryByTestId(
        'stripe-disconnect-refused',
      ),
    ).toBeNull();
  });

  it('is not offered where Stripe is not connected', async () => {
    standing('available');
    renderWithClient(<StripeConnectorDetail stripeSettings={null} />);

    await keyField();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open in Stripe' })).toBeNull();
  });

  it('is not offered to a session that may not write the settings of the organization', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:organizations']));
    standing('connected');
    renderWithClient(<StripeConnectorDetail stripeSettings={stored()} />);

    await screen.findByTestId('stripe-read-only');
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
  });
});

describe('where Stripe cannot be connected', () => {
  it('says that a self-hosted deployment needs a Vault, links to how, and offers no way to connect', async () => {
    standing('vaultMissing');
    renderWithClient(<StripeConnectorDetail stripeSettings={null} />);

    const notice = await screen.findByTestId('stripe-unavailable');
    expect(notice).toHaveAttribute('data-reason', 'VAULT_NOT_CONFIGURED');
    expect(notice).toHaveTextContent('Stripe needs a configured Vault');
    expect(within(notice).getByRole('link', { name: /Self-hosting settings/ })).toHaveAttribute(
      'href',
      'https://docs.kaiten.sh/docs/self-hosting/environment-variables',
    );
    expect(await keyField()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Connect Stripe' })).toBeDisabled();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('says that the plan of the organization leaves it out', async () => {
    standing('notEntitled');
    renderWithClient(<StripeConnectorDetail stripeSettings={null} />);

    const notice = await screen.findByTestId('stripe-unavailable');
    expect(notice).toHaveAttribute('data-reason', 'NOT_ENTITLED');
    expect(notice).toHaveTextContent('Not included in your plan');
    expect(within(notice).queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: 'Connect Stripe' })).toBeDisabled();
  });

  it('gives a generic reason where the API does not list Stripe at all', async () => {
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilitiesProfiles.stack(),
      }),
    );
    renderWithClient(<StripeConnectorDetail stripeSettings={null} />);

    const notice = await screen.findByTestId('stripe-unavailable');
    expect(notice).toHaveAttribute('data-reason', 'UNKNOWN');
    expect(notice).toHaveTextContent('Stripe is not available here');
  });

  it('shows the settings to a session that may read them and not write them, without a way to save', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:organizations']));
    standing('available');
    renderWithClient(<StripeConnectorDetail stripeSettings={stored()} />);

    expect(await screen.findByTestId('stripe-read-only')).toHaveTextContent(
      'You can read these settings and not change them',
    );
    expect(await keyField()).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Connect Stripe/ })).toBeNull();
  });
});
