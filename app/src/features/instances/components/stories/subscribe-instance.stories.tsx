import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, fn, screen } from 'storybook/test';
import type { Customer } from '@/api-client';
import { handleGetBillingSettings } from '@/api-client/msw.gen';
import { StackedFormDialog } from '@/functionals/stacked-form-dialog';
import {
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
) => (
  <SubscribeInstanceForm
    customer={customer(billingEmail)}
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
            discountTotal: 0,
            handoffStatus: 'PENDING',
            id: 'inv-activation',
            instanceName: 'Acme Production',
            instanceSlug: 'acme-production',
            kind: 'ACTIVATION',
            licenseSlug: 'enterprise',
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
