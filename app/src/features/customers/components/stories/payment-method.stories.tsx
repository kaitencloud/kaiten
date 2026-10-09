import type { Meta, StoryObj } from '@storybook/react-vite';
import { HttpResponse, type RequestHandler } from 'msw';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import type { PaymentMethodLabels } from '@/api-client';
import {
  handleCreatePaymentMethodSession,
  handleDetachPaymentMethod,
  handleGetBillingCapabilities,
  handleGetCustomerBilling,
} from '@/api-client/msw.gen';
import { billingCapabilitiesProfiles } from '@/test-fixtures/storybook-billing-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { PaymentMethodCard } from '../customer-detail/payment-method/payment-method-card';

const meta = {
  title: 'Features/Customers/PaymentMethod',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const VISA: PaymentMethodLabels = {
  attachedAt: '2027-01-15T00:00:00.000Z',
  brand: 'visa',
  expMonth: 12,
  expYear: 2099,
  last4: '4242',
  status: 'ACTIVE',
};

/** What Stripe holds of the customer, with the card the story gives it. */
const billing = (paymentMethod: PaymentMethodLabels | null) =>
  handleGetCustomerBilling({
    body: {
      billingEmail: 'ap@acme.test',
      providers: paymentMethod
        ? [
            {
              externalCustomerId: 'cus_acme',
              paymentMethod,
              providerKind: 'STRIPE',
              webUrl: 'https://dashboard.stripe.com/test/customers/cus_acme',
            },
          ]
        : [],
    },
  });

/** A story's handlers replace the file's, so each says that Stripe is connected. */
const handlers = (...more: RequestHandler[]): RequestHandler[] => [
  ...more,
  handleGetBillingCapabilities({
    body: billingCapabilitiesProfiles.stackWithStripe('connected'),
  }),
];

const card = () => (
  <StorybookRouter>
    <PaymentMethodCard customerSlug="acme-corp" onSetupHandled={fn()} />
  </StorybookRouter>
);

// The card Stripe charges, as labels: the brand, the last four digits and the expiry.
export const Active: Story = {
  parameters: { msw: { handlers: handlers(billing(VISA)) } },
  render: card,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const method = await canvas.findByTestId('payment-method');

    await expect(method).toHaveTextContent('Visa ending in 4242');
    await expect(method).toHaveTextContent('Expires 12/2099');
    await expect(canvas.getByRole('button', { name: 'Replace' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Manage in Stripe' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Remove' })).toBeVisible();
  },
};

export const ExpiresSoon: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        billing({
          ...VISA,
          expMonth: new Date().getUTCMonth() + 1,
          expYear: new Date().getUTCFullYear(),
        }),
      ),
    },
  },
  render: card,
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Expires soon')).toBeVisible();
  },
};

// A charge said the card is no longer usable: another has to be saved.
export const ChargeFailed: Story = {
  parameters: { msw: { handlers: handlers(billing({ ...VISA, status: 'FAILED' })) } },
  render: card,
  play: async ({ canvasElement }) => {
    const method = await within(canvasElement).findByTestId('payment-method');

    await expect(method).toHaveAttribute('data-standing', 'failed');
    await expect(method).toHaveTextContent('Last charge failed');
  },
};

export const Expired: Story = {
  parameters: { msw: { handlers: handlers(billing({ ...VISA, status: 'EXPIRED' })) } },
  render: card,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByTestId('payment-method'),
    ).toHaveTextContent('This card has expired');
  },
};

// A customer that has never been to Stripe has no method, and a way to add one.
export const NoPaymentMethod: Story = {
  parameters: { msw: { handlers: handlers(billing(null)) } },
  render: card,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('No payment method on file')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Add a payment method' })).toBeVisible();
  },
};

// Stripe cannot charge a customer without a card, and the API will not take it away
// from a contract that is charged automatically: the dialog says what to do first.
export const RemoveRefused: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        handleDetachPaymentMethod(() =>
          HttpResponse.json(
            {
              code: 'DetachPaymentMethod.InUseByAutomaticCollection',
              detail:
                'a live subscription of the customer is charged automatically: switch it to SEND_INVOICE first',
              status: 409,
              title: 'Conflict',
            },
            { status: 409 },
          ),
        ),
        billing(VISA),
      ),
    },
  },
  render: card,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole('button', { name: 'Remove' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(async () =>
      expect(
        await within(dialog).findByTestId('payment-method-remove-refused'),
      ).toHaveTextContent('in the Billing tab of their instance'),
    );
  },
};

// Adding or replacing a method asks Stripe for a page it hosts. When Stripe cannot be reached the
// API changes nothing and says so, and the card offers to ask again.
export const SetupUnreachable: Story = {
  parameters: {
    msw: {
      handlers: handlers(
        handleCreatePaymentMethodSession(() =>
          HttpResponse.json(
            {
              code: 'CreatePaymentMethodSession.ProviderUnavailable',
              detail: 'the payment provider could not be reached',
              status: 503,
              title: 'Service Unavailable',
            },
            { status: 503 },
          ),
        ),
        billing(VISA),
      ),
    },
  },
  render: card,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole('button', { name: 'Replace' }));

    const alert = await canvas.findByRole('alert');
    await expect(alert).toHaveTextContent('Nothing was changed.');
    await expect(within(alert).getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};
