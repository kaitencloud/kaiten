import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { BillingSettings } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetBillingSettings,
} from '@/api-client/msw.gen';
import { billingCapabilities } from '../../../../../../e2e/app/_support/model/billing-capabilities';
import { billingCapabilitiesProfiles } from '@/test-fixtures/storybook-billing-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { BillingDefaultsCard } from '../billing-defaults-card';
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

// Stripe is listed only where the release ships it, with its state alone: it is
// connected on another screen.
export const WithStripe: Story = {
  parameters: {
    msw: {
      handlers: [
        handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.full() }),
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
  parameters: {
    msw: {
      handlers: [
        handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.full() }),
      ],
    },
  },
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

// The page: the three cards, the defaults read by the page so that a refusal
// shows with a way to ask again.
export const Page: Story = {
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        handleGetBillingCapabilities({
          body: billingCapabilitiesProfiles.stack(),
        }),
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
    await expect(await canvas.findByTestId('billing-defaults')).toBeVisible();
    await expect(canvas.getByTestId('billing-retention')).toBeVisible();
  },
};
