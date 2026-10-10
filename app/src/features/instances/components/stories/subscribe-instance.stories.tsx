import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, fn, screen } from 'storybook/test';
import type { Customer } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetBillingSettings,
} from '@/api-client/msw.gen';
import { StackedFormDialog } from '@/functionals/stacked-form-dialog';
import {
  billingCapabilitiesProfiles,
  buildPrice,
  buildSubscription,
} from '@/test-fixtures/storybook-billing-fixtures';
import { storyCustomers } from '@/test-fixtures/storybook-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { SubscribeInstanceForm } from '../instance-detail/tabs/billing/subscribe/subscribe-instance-form';
import { SubscribedState } from '../instance-detail/tabs/billing/subscribe/subscribed-state';

const meta = {
  title: 'Features/Instances/SubscribeInstance',
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        handleGetBillingSettings({
          body: {
            defaultCollectionMethod: 'SEND_INVOICE',
            defaultDaysUntilDue: 30,
            handoffStripeInvoices: false,
          },
        }),
      ],
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const [acme] = storyCustomers;
const customer = (billingEmail?: string): Customer => ({
  ...acme,
  billingEmail,
});

const MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Enterprise, monthly',
  id: 'price-enterprise-monthly',
  isDefault: true,
  unitAmountDecimal: '49900',
});

const ANNUAL_IN_ARREARS = buildPrice({
  billingPeriod: 'ANNUAL',
  billingTiming: 'ARREARS',
  displayLabel: 'Enterprise, annual',
  id: 'price-enterprise-annual',
  unitAmountDecimal: '499000',
});

// The dialog fades in: what it holds is checked to be there, and not to be visible
// at the first frame, when its opacity is still 0.
const inDialog = (children: ReactNode) => (
  <StorybookRouter>
    <StackedFormDialog
      confirmOnClose={false}
      description="Pin this instance to a price of its license and start billing it."
      onOpenChange={fn()}
      open
      title="Subscribe Acme Production"
    >
      {children}
    </StackedFormDialog>
  </StorybookRouter>
);

const form = (
  prices = [MONTHLY, ANNUAL_IN_ARREARS],
  billingEmail?: string,
  defaultTrialDays?: number,
) => (
  <SubscribeInstanceForm
    customer={customer(billingEmail)}
    defaultTrialDays={defaultTrialDays}
    instanceSlug="acme-production"
    onCancel={fn()}
    onSubscribed={fn()}
    prices={prices}
  />
);

// The price to pin the subscription to, the default first, the payment terms and
// the start (both optional, and saying what an empty field means), when the first
// invoice is issued, and, for a customer with no billing e-mail, a way to set one
// without leaving the dialog.
export const Default: Story = {
  render: () => inDialog(form()),
  play: async () => {
    await expect(await screen.findByText('Payment provider')).toBeInTheDocument();
    await expect(
      await screen.findByText(
        'The first invoice is issued as soon as the subscription starts.',
      ),
    ).toBeInTheDocument();
    await expect(screen.getByTestId('billing-email-notice')).toBeInTheDocument();
    await expect(
      await screen.findByPlaceholderText('Organization default: 30'),
    ).toBeInTheDocument();
  },
};

export const CustomerWithABillingEmail: Story = {
  render: () => inDialog(form([MONTHLY, ANNUAL_IN_ARREARS], 'ap@acme.test')),
  play: async () => {
    await expect(await screen.findByText('Payment provider')).toBeInTheDocument();
    await expect(screen.queryByTestId('billing-email-notice')).toBeNull();
  },
};

const settingsHandler = handleGetBillingSettings({
  body: {
    defaultCollectionMethod: 'SEND_INVOICE',
    defaultDaysUntilDue: 30,
    handoffStripeInvoices: false,
  },
});

// Where the release has trials the dialog offers one, prefilled with what the license
// carries. The summary says that nothing is invoiced now, and when the first invoice is.
export const WithATrial: Story = {
  parameters: {
    msw: {
      handlers: [
        settingsHandler,
        handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
      ],
    },
  },
  render: () => inDialog(form([MONTHLY, ANNUAL_IN_ARREARS], 'ap@acme.test', 14)),
  play: async () => {
    await expect(await screen.findByLabelText('Trial (days)')).toHaveValue('14');
    await expect(await screen.findByTestId('subscribe-summary')).toHaveTextContent(
      'No invoice now. The first invoice is issued at the end of the trial, on',
    );
  },
};

// Without the trials of the release, the dialog does not ask for one.
export const WithoutTrials: Story = {
  render: () => inDialog(form([MONTHLY, ANNUAL_IN_ARREARS], 'ap@acme.test', 14)),
  play: async () => {
    await expect(await screen.findByText('Payment provider')).toBeInTheDocument();
    await expect(screen.queryByLabelText('Trial (days)')).toBeNull();
  },
};

// A price billed in arrears issues nothing until its first period closes: the
// summary says when, and never how much.
export const PriceBilledInArrears: Story = {
  render: () => inDialog(form([ANNUAL_IN_ARREARS], 'ap@acme.test')),
  play: async () => {
    await expect(
      await screen.findByText(
        /Nothing is invoiced until the first period closes: the first invoice is issued on/,
      ),
    ).toBeInTheDocument();
  },
};

// Once the subscription has started the dialog says so, with the way to the invoice
// of the first period, and takes the focus the button that sent the form had.
export const Started: Story = {
  render: () =>
    inDialog(
      <SubscribedState
        onClose={fn()}
        started={{
          ...buildSubscription({
            anchorAt: '2027-03-01T00:00:00.000Z',
            basePrice: MONTHLY,
            customerName: acme.name,
            customerSlug: acme.slug,
            instanceName: 'Acme Production',
            instanceSlug: 'acme-production',
          }),
          activationInvoice: {
            boundaryAt: '2027-03-01T00:00:00.000Z',
            collectionMethod: 'SEND_INVOICE',
            createdAt: '2027-03-01T00:00:00.000Z',
            currency: 'USD',
            customerName: acme.name,
            customerSlug: acme.slug,
            daysUntilDue: null,
            discountTotal: 0,
            dueAt: null,
            handoffStatus: 'PENDING',
            holdReason: null,
            id: 'inv-activation',
            instanceName: 'Acme Production',
            instanceSlug: 'acme-production',
            issuedAt: null,
            kind: 'ACTIVATION',
            licenseSlug: 'enterprise',
            paidAt: null,
            providerKind: 'NOOP',
            serviceFrom: '2027-03-01T00:00:00.000Z',
            serviceTo: '2027-04-01T00:00:00.000Z',
            status: 'MANUAL',
            subtotal: 49900,
            total: 49900,
            updatedAt: '2027-03-01T00:00:00.000Z',
          },
        }}
      />,
    ),
  play: async () => {
    const started = await screen.findByTestId('subscribed');

    await expect(started).toHaveTextContent('Subscription started');
    await expect(started).toHaveTextContent('$499.00');
    await expect(screen.getByRole('link', { name: 'View the invoice' })).toBeInTheDocument();
    await expect(started).toHaveFocus();
  },
};
