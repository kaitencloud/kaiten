import type { Meta, StoryObj } from '@storybook/react-vite';
import { HttpResponse } from 'msw/http';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ConnectorSettings } from '@/api-client';
import {
  handleDeactivateConnector,
  handleGetBillingCapabilities,
  handleUpdateConnectorSettings,
} from '@/api-client/msw.gen';
import { STRIPE_CONNECTOR_NAME } from '@/domains/billing';
import { billingCapabilitiesProfiles } from '@/test-fixtures/storybook-billing-fixtures';
import type { StripeStanding } from '../../../../../../e2e/app/_support/model/billing-capabilities';
import { StripeConnectorDetail } from '../stripe-connector-detail';

/** What the API holds of a connected Stripe: the key is never returned, only `***`. */
const stored = (settings: Record<string, unknown> = {}): ConnectorSettings => ({
  connector_name: STRIPE_CONNECTOR_NAME,
  settings: {
    autoFinalize: true,
    automaticTax: false,
    stripeSecretKey: '***',
    taxBehavior: 'EXCLUSIVE',
    ...settings,
  },
});

/** Where Stripe stands for the organization, as the capabilities list it. */
const standing = (state: StripeStanding) =>
  handleGetBillingCapabilities({
    body: billingCapabilitiesProfiles.stackWithStripe(state),
  });

const problem = (
  status: number,
  body: { code: string; detail: string; errors?: unknown[] },
) => HttpResponse.json({ ...body, status, title: 'Error' }, { status });

const meta = {
  title: 'Features/Connectors/Stripe',
  component: StripeConnectorDetail,
  parameters: { layout: 'fullscreen', msw: { handlers: [standing('available')] } },
  render: (args) => (
    <div className="h-screen p-6">
      <StripeConnectorDetail {...args} />
    </div>
  ),
  tags: ['autodocs'],
} satisfies Meta<typeof StripeConnectorDetail>;

export default meta;
type Story = StoryObj<typeof StripeConnectorDetail>;

const keyField = (canvas: ReturnType<typeof within>) =>
  canvas.findByLabelText(/Restricted API key/);

async function typeKey(canvas: ReturnType<typeof within>, key: string) {
  const field = await keyField(canvas);
  await waitFor(() => expect(field).toBeEnabled());
  await userEvent.clear(field);
  await userEvent.type(field, key);

  return field;
}

// Nothing is connected: the key is asked for, hidden as it is typed, and checked
// before anything is sent. A secret key is refused with the reason.
export const NotConnected: Story = {
  args: { stripeSettings: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = await keyField(canvas);

    await expect(field).toHaveAttribute('type', 'password');
    await expect(
      await canvas.findByRole('button', { name: 'Connect Stripe' }),
    ).toBeDisabled();

    await typeKey(canvas, 'sk_live_51Habc');
    await expect(
      await canvas.findByText(/gives Kaiten access to far more than it needs/),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Connect Stripe' }),
    ).toBeDisabled();

    await typeKey(canvas, 'rk_test_51Habc');
    await expect(
      await canvas.findByText('This key reaches a Stripe account in Test mode.'),
    ).toBeVisible();
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Connect Stripe' })).toBeEnabled(),
    );
  },
};

// Stripe refuses the key: the reason is shown on the key, in Stripe's words, and
// what was typed stays.
export const CredentialsRejected: Story = {
  args: { stripeSettings: null },
  parameters: {
    msw: {
      handlers: [
        handleUpdateConnectorSettings(() =>
          problem(422, {
            code: 'UpdateConnectorSettings.CredentialsRejected',
            detail:
              'the payment provider refused the credentials: Invalid API Key provided',
            errors: [
              {
                location: 'body.settings.stripeSecretKey',
                message: 'provider error',
              },
            ],
          }),
        ),
        standing('available'),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = await typeKey(canvas, 'rk_test_51Habc');

    await userEvent.click(canvas.getByRole('button', { name: 'Connect Stripe' }));

    await expect(
      await canvas.findByText(
        'the payment provider refused the credentials: Invalid API Key provided',
      ),
    ).toBeVisible();
    await expect(field).toHaveValue('rk_test_51Habc');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
  },
};

// Stripe cannot be reached to check the key: nothing was changed, and asking again is offered.
export const ProviderUnreachable: Story = {
  args: { stripeSettings: null },
  parameters: {
    msw: {
      handlers: [
        handleUpdateConnectorSettings(() =>
          problem(503, {
            code: 'UpdateConnectorSettings.ProviderUnavailable',
            detail:
              'the payment provider could not be reached to check the credentials; retry in a moment',
          }),
        ),
        standing('available'),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await typeKey(canvas, 'rk_test_51Habc');

    await userEvent.click(canvas.getByRole('button', { name: 'Connect Stripe' }));

    const alert = await canvas.findByRole('alert');
    await expect(alert).toHaveTextContent('could not be reached');
    await expect(within(alert).getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

// Connected to a test account: the badge says which, the key is on file and says
// so, and the options open as they were stored.
export const ConnectedTestMode: Story = {
  args: {
    stripeSettings: stored({ automaticTax: true, taxBehavior: 'INCLUSIVE' }),
  },
  parameters: { msw: { handlers: [standing('connected')] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Connected')).toBeVisible();
    await expect(canvas.getByText('Test mode')).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: 'Open in Stripe' }),
    ).toHaveAttribute('href', 'https://dashboard.stripe.com/test');
    await expect(await keyField(canvas)).toHaveAttribute(
      'placeholder',
      'Key set (Test mode) — enter a new key to replace it',
    );
    await expect(canvas.getByLabelText('Compute tax automatically')).toBeChecked();
    await expect(canvas.getByRole('combobox')).toHaveTextContent(
      'Amounts include tax',
    );
  },
};

// Connected to the live account: the badge is the warning one, since invoices pushed here are real.
export const ConnectedLiveMode: Story = {
  args: { stripeSettings: stored() },
  parameters: { msw: { handlers: [standing('connectedLive')] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Live mode')).toHaveAttribute(
      'data-mode',
      'live',
    );
    await expect(
      canvas.getByRole('link', { name: 'Open in Stripe' }),
    ).toHaveAttribute('href', 'https://dashboard.stripe.com');
  },
};

// A key of another account while Stripe holds customers: refused above the button.
export const AccountChanged: Story = {
  args: { stripeSettings: stored() },
  parameters: {
    msw: {
      handlers: [
        handleUpdateConnectorSettings(() =>
          problem(409, {
            code: 'UpdateConnectorSettings.AccountChanged',
            detail:
              "the new key reaches another account than the one this organization's customers live in",
          }),
        ),
        standing('connected'),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await typeKey(canvas, 'rk_live_51Habc');

    await userEvent.click(await canvas.findByRole('button', { name: 'Save changes' }));

    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'another account than the one this organization',
    );
  },
};

// Billing still routes to Stripe: the dialog stays open on the API's words and counts what holds it.
export const DisconnectRefused: Story = {
  args: { stripeSettings: stored() },
  parameters: {
    msw: {
      handlers: [
        handleDeactivateConnector(() =>
          problem(409, {
            code: 'DeactivateConnector.BillingActive',
            detail:
              'subscriptions or unsettled invoices still route to this payment provider; cancel or switch them, and settle the invoices, first',
            errors: [
              {
                location: 'connector',
                message: 'still routing',
                value: { activeSubscriptions: 3, openInvoices: 1 },
              },
            ],
          }),
        ),
        standing('connected'),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole('button', { name: 'Disconnect' }));
    const dialog = await within(document.body).findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    const routing = await within(dialog).findByTestId('stripe-routing');
    await expect(routing).toHaveTextContent(
      '3 subscriptions that are not canceled are still collected through Stripe.',
    );
    await expect(routing).toHaveTextContent(
      '1 invoice that is not settled is still in Stripe.',
    );
  },
};

// A self-hosted deployment without the Vault that stores the key: the page says
// what to set up, and leaves the form off.
export const VaultNotConfigured: Story = {
  args: { stripeSettings: null },
  parameters: { msw: { handlers: [standing('vaultMissing')] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notice = await canvas.findByTestId('stripe-unavailable');

    await waitFor(() =>
      expect(notice).toHaveAttribute('data-reason', 'VAULT_NOT_CONFIGURED'),
    );
    await expect(
      within(notice).getByRole('link', { name: /Self-hosting settings/ }),
    ).toBeVisible();
    await expect(await keyField(canvas)).toBeDisabled();
    await expect(canvas.queryByRole('button', { name: 'Connect Stripe' })).toBeNull();
  },
};

// The plan of the organization leaves the connector out.
export const NotEntitled: Story = {
  args: { stripeSettings: null },
  parameters: { msw: { handlers: [standing('notEntitled')] } },
  play: async ({ canvasElement }) => {
    const notice = await within(canvasElement).findByTestId('stripe-unavailable');

    await waitFor(() =>
      expect(notice).toHaveAttribute('data-reason', 'NOT_ENTITLED'),
    );
    await expect(notice).toHaveTextContent('Not included in your plan');
  },
};
