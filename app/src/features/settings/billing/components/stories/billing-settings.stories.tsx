import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { BillingSettings } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetBillingHealth,
  handleGetBillingSettings,
} from '@/api-client/msw.gen';
import {
  billingCapabilities,
  type StripeStanding,
} from '../../../../../../e2e/app/_support/model/billing-capabilities';
import {
  CLEAR_HEALTH,
  healthWith,
  syncedStripe,
} from '@/test-fixtures/billing-health-fixtures';
import { billingCapabilitiesProfiles } from '@/test-fixtures/storybook-billing-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { BillingDefaultsCard } from '../billing-defaults-card';
import { BillingHealthCard } from '../billing-health-card';
import { BillingProvidersCard } from '../billing-providers-card';
import { BillingRetentionCard } from '../billing-retention-card';
import { BillingSettingsPageContent } from '../billing-settings-page-content';

const meta = {
  title: 'Features/Settings/BillingSettings',
  parameters: {
    layout: 'padded',
    msw: {
      handlers: [
        handleGetBillingCapabilities({
          body: billingCapabilitiesProfiles.stack(),
        }),
      ],
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const STORED: BillingSettings = {
  defaultCollectionMethod: 'SEND_INVOICE',
  defaultDaysUntilDue: 30,
  handoffStripeInvoices: false,
};

// Who collects the invoices: NoOp is always there, and the organization collects
// them itself. The card says there is nothing to connect, and leads to the queue.
export const NoOpOnly: Story = {
  render: () => (
    <StorybookRouter>
      <BillingProvidersCard />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const noop = await within(canvasElement).findByTestId(
      'billing-provider-noop',
    );

    await expect(noop).toHaveTextContent('Nothing to connect.');
    await expect(
      within(canvasElement).queryByTestId('billing-provider-stripe'),
    ).toBeNull();
  },
};

const stripeIs = (standing: StripeStanding) =>
  handleGetBillingCapabilities({
    body: billingCapabilitiesProfiles.stackWithStripe(standing),
  });

// Stripe is listed as the API lists it, with where it stands: connected here to a
// test account, with how its last pass went. Connecting it is another screen.
export const WithStripe: Story = {
  parameters: {
    msw: {
      handlers: [
        stripeIs('connected'),
        handleGetBillingHealth({
          body: healthWith({ providerSync: [syncedStripe()] }),
        }),
      ],
    },
  },
  render: () => (
    <StorybookRouter>
      <BillingProvidersCard />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const stripe = await within(canvasElement).findByTestId(
      'billing-provider-stripe',
    );

    await expect(stripe).toHaveTextContent('Connected');
    await expect(stripe).toHaveTextContent('Test mode');
    await expect(await within(stripe).findByTestId('billing-provider-sync')).toHaveTextContent(
      /Last synced/,
    );
    await expect(
      within(stripe).getByRole('link', { name: 'Manage the connection' }),
    ).toBeVisible();
  },
};

// The passes keep failing: invoices paid or voided in Stripe are not read back, which
// the card warns of with the last thing Stripe answered.
export const StripeSyncFailing: Story = {
  parameters: {
    msw: {
      handlers: [
        stripeIs('connected'),
        handleGetBillingHealth({
          body: healthWith({
            providerSync: [
              syncedStripe({
                consecutiveFailures: 4,
                lastSyncError: 'the payment provider could not be reached',
                lastSyncStatus: 'FAILED',
              }),
            ],
          }),
        }),
      ],
    },
  },
  render: () => (
    <StorybookRouter>
      <BillingProvidersCard />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const sync = await within(canvasElement).findByTestId('billing-provider-sync');

    await expect(sync).toHaveAttribute('data-standing', 'failing');
    await expect(sync).toHaveTextContent('4 syncs in a row failed');
    await expect(sync).toHaveTextContent('the payment provider could not be reached');
  },
};

// Stripe can be connected here and is not.
export const StripeAvailable: Story = {
  parameters: { msw: { handlers: [stripeIs('available')] } },
  render: () => (
    <StorybookRouter>
      <BillingProvidersCard />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const stripe = await within(canvasElement).findByTestId(
      'billing-provider-stripe',
    );

    await expect(stripe).toHaveTextContent('Not connected');
    await expect(
      await within(stripe).findByRole('link', { name: 'Connect Stripe' }),
    ).toBeVisible();
  },
};

// A self-hosted deployment without a Vault cannot connect Stripe, and says why.
export const StripeNeedsAVault: Story = {
  parameters: { msw: { handlers: [stripeIs('vaultMissing')] } },
  render: () => (
    <StorybookRouter>
      <BillingProvidersCard />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const stripe = await within(canvasElement).findByTestId(
      'billing-provider-stripe',
    );

    await expect(stripe).toHaveTextContent('Unavailable');
    await expect(stripe).toHaveTextContent('Needs a Vault to store the key in');
  },
};

// What needs a person's attention: a figure for each thing counted, a link to the
// invoices where the list can filter to them, and a button that syncs with Stripe now.
export const HealthNeedsAttention: Story = {
  parameters: {
    msw: {
      handlers: [
        stripeIs('connected'),
        handleGetBillingHealth({
          body: healthWith({
            closeBacklog: { count: 1, oldestDueAt: '2027-02-28T00:00:00Z' },
            handoff: { oldestPendingIssuedAt: '2027-03-01T00:00:00Z', pending: 4 },
            heldInvoices: {
              byReason: {
                LEDGER_CHAIN_BREAK: 0,
                LEDGER_COUNTER_MISMATCH: 0,
                LEDGER_SEQUENCE_GAP: 2,
              },
              count: 2,
            },
            overdueInvoices: 3,
            pushFailures: { count: 1, oldestFailedAt: '2027-03-02T00:00:00Z' },
            reconciliationMismatches30d: 5,
          }),
        }),
      ],
    },
  },
  render: () => (
    <StorybookRouter>
      <BillingHealthCard />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const held = await canvas.findByTestId('billing-health-held');

    await expect(held).toHaveAttribute('data-count', '2');
    await expect(
      within(held).getByRole('link', { name: 'Held invoices' }),
    ).toHaveAttribute('href', expect.stringContaining('held=true'));
    await expect(canvas.getByTestId('billing-health-mismatches')).toHaveAttribute(
      'data-count',
      '5',
    );
    await expect(canvas.getByRole('button', { name: 'Sync now' })).toBeEnabled();
  },
};

// Nothing is held, overdue or waiting: one line, in place of seven zeros.
export const HealthAllClear: Story = {
  parameters: {
    msw: {
      handlers: [
        stripeIs('connected'),
        handleGetBillingHealth({ body: CLEAR_HEALTH }),
      ],
    },
  },
  render: () => (
    <StorybookRouter>
      <BillingHealthCard />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByTestId('billing-health-clear'),
    ).toHaveTextContent('All clear');
  },
};

// The defaults a subscription takes when it names none of its own: how it is
// collected, how long it is due. Charging automatically is listed and cannot be
// chosen where no payment provider can do it.
export const Defaults: Story = {
  render: () => (
    <StorybookRouter>
      <BillingDefaultsCard settings={STORED} />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByLabelText(/Payment terms \(days\)/)).toHaveValue(
      '30',
    );
    await expect(canvas.getByRole('combobox')).toBeVisible();
    // Handing off the invoices of a provider is a question about nothing until
    // one is shipped.
    await expect(canvas.queryByLabelText('Hand off Stripe invoices')).toBeNull();
  },
};

export const DefaultsWithAProvider: Story = {
  parameters: { msw: { handlers: [stripeIs('connected')] } },
  render: () => (
    <StorybookRouter>
      <BillingDefaultsCard settings={{ ...STORED, handoffStripeInvoices: true }} />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByLabelText('Hand off Stripe invoices'),
    ).toBeChecked();
  },
};

// How long usage is kept: what the deployment says of itself, so nothing here is
// edited.
export const Retention: Story = {
  render: () => <BillingRetentionCard />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        'Usage reports are kept for 18 months.',
      ),
    ).toBeVisible();
  },
};

export const RetentionNotReported: Story = {
  parameters: {
    msw: {
      handlers: [
        handleGetBillingCapabilities({
          body: billingCapabilities({ usageHistoryRetentionMonths: undefined }),
        }),
      ],
    },
  },
  render: () => <BillingRetentionCard />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/No time limit is reported/),
    ).toBeVisible();
  },
};

// The page: the cards, the defaults read by the page so that a refusal shows with
// a way to ask again.
export const Page: Story = {
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        stripeIs('connected'),
        handleGetBillingHealth({ body: healthWith({ overdueInvoices: 1 }) }),
        handleGetBillingSettings({ body: STORED }),
      ],
    },
  },
  render: () => (
    <StorybookRouter>
      <BillingSettingsPageContent />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByTestId('billing-providers')).toBeVisible();
    await expect(await canvas.findByTestId('billing-health')).toBeVisible();
    await expect(await canvas.findByTestId('billing-defaults')).toBeVisible();
    await expect(canvas.getByTestId('billing-retention')).toBeVisible();
  },
};
