import type { Meta, StoryObj } from '@storybook/react-vite';
import { HttpResponse, type RequestHandler } from 'msw';
import type { ReactNode } from 'react';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import type { InstanceBilling } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetBillingSettings,
  handleGetCustomer,
  handleGetInstanceBilling,
  handleGetInvoice,
  handleListInstanceInvoices,
} from '@/api-client/msw.gen';
import {
  billingCapabilitiesProfiles,
  buildInvoice,
  buildInvoiceLine,
  buildPrice,
  buildProviderRecord,
  buildSubscription,
} from '@/test-fixtures/storybook-billing-fixtures';
import {
  storyCustomers,
  storyInstances,
} from '@/test-fixtures/storybook-fixtures';
import {
  instanceDetailHandlers,
  onePage,
} from '@/test-fixtures/storybook-handlers';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { InstanceDetailProvider } from '../instance-detail/instance-detail-context';
import { PaymentTermsDialog } from '../instance-detail/tabs/billing/terms/payment-terms-dialog';

const meta = {
  title: 'Features/Instances/BillingProvider',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const instance = storyInstances[0];

const MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Enterprise, monthly',
  id: 'price-enterprise-monthly',
  isDefault: true,
  unitAmountDecimal: '49900',
});

const subscription = (
  overrides: Partial<InstanceBilling> = {},
): InstanceBilling => ({
  ...buildSubscription({
    anchorAt: '2027-02-15T00:00:00.000Z',
    basePrice: MONTHLY,
    currentPeriodEnd: '2027-03-15T00:00:00.000Z',
    currentPeriodStart: '2027-02-15T00:00:00.000Z',
    customerName: 'Acme Corp',
    customerSlug: 'acme-corp',
    instanceName: instance.name,
    instanceSlug: instance.slug,
  }),
  ...overrides,
});

/** A contract Stripe collects by charging the card on file. */
const onStripe = () =>
  subscription({
    collectionMethod: 'CHARGE_AUTOMATICALLY',
    collectionMethodOverride: 'CHARGE_AUTOMATICALLY',
    providerKind: 'STRIPE',
  });

const line = buildInvoiceLine({
  amount: 49900,
  description: '1 × $499.00 per month',
  invoiceId: 'inv-open',
  label: 'Enterprise, monthly',
  seq: 1,
  serviceFrom: '2027-02-15T00:00:00.000Z',
  serviceTo: '2027-03-15T00:00:00.000Z',
  type: 'BASE',
});

const invoice = (
  id: string,
  overrides: Partial<Parameters<typeof buildInvoice>[0]> = {},
) =>
  buildInvoice({
    boundaryAt: '2027-02-15T00:00:00.000Z',
    id,
    lines: [line],
    ...overrides,
  });

/**
 * Everything the dialog reads: the instance page, billing, the subscription, the
 * customer (with an address Stripe can send the invoices to) and its invoices. What a
 * story adds comes first, since the first handler that matches answers.
 */
const handlersFor = (
  value: InstanceBilling,
  invoices: ReturnType<typeof invoice>[],
  ...more: RequestHandler[]
): RequestHandler[] => [
  ...more,
  handleGetBillingCapabilities({
    body: billingCapabilitiesProfiles.stackWithStripe('connected'),
  }),
  handleGetInstanceBilling({ body: value }),
  handleListInstanceInvoices(onePage(invoices)),
  handleGetBillingSettings({
    body: {
      defaultCollectionMethod: 'SEND_INVOICE',
      defaultDaysUntilDue: 30,
      handoffStripeInvoices: false,
    },
  }),
  handleGetCustomer({
    body: { ...storyCustomers[0], billingEmail: 'ap@acme.com' },
  }),
  ...instanceDetailHandlers,
];

function DialogFrame({ children }: { children: ReactNode }) {
  return (
    <StorybookRouter
      initialEntries={[`/customers/instances/${instance.slug}`]}
      routePath="/customers/instances/$instanceSlug"
    >
      <InstanceDetailProvider instanceId={instance.slug}>
        {children}
      </InstanceDetailProvider>
    </StorybookRouter>
  );
}

const dialog = () => (
  <DialogFrame>
    <PaymentTermsDialog onClose={fn()} />
  </DialogFrame>
);

const findDialog = () =>
  screen.findByRole('dialog', { name: 'Provider and terms of Acme Production' });

async function choose(combobox: HTMLElement, option: string) {
  await userEvent.click(combobox);
  await userEvent.click(await screen.findByRole('option', { name: option }));
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
}

// Where Stripe is connected the dialog is for the provider as well as the terms: who
// collects the invoices of the contract, how, and the days.
export const ProviderAndTerms: Story = {
  parameters: { msw: { handlers: handlersFor(subscription(), []) } },
  render: dialog,
  play: async () => {
    const frame = await findDialog();

    await expect(
      await within(frame).findByRole('combobox', { name: /Collected by/ }),
    ).toHaveTextContent('Manual hand-off');
    await expect(
      within(frame).getByRole('combobox', { name: /Collection method/ }),
    ).toHaveTextContent('Send the invoice');
    await expect(within(frame).getByLabelText('Payment terms (days)')).toBeVisible();
  },
};

// Moving a contract to Stripe lists the invoices still open and what becomes of each:
// the ready-to-bill one stays with the organization, the held one is a deliberate choice.
export const SwitchToStripe: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(subscription(), [
        invoice('inv-manual', { providerKind: 'NOOP', status: 'MANUAL' }),
        invoice('inv-held', {
          holdReason: 'LEDGER_SEQUENCE_GAP',
          providerKind: 'NOOP',
          status: 'DRAFT',
        }),
        invoice('inv-paid', { providerKind: 'NOOP', status: 'PAID' }),
      ]),
    },
  },
  render: dialog,
  play: async () => {
    const frame = await findDialog();

    await choose(
      await within(frame).findByRole('combobox', { name: /Collected by/ }),
      'Stripe',
    );

    const rows = await within(frame).findAllByTestId('open-invoice');
    await expect(rows).toHaveLength(2);
    await expect(rows[0]).toHaveTextContent('still counts toward a late payment');
    await expect(rows[1]).toHaveTextContent('choose deliberately');
  },
};

// Moving it away from Stripe: what Stripe has stays collected by Stripe, a draft Stripe
// holds for a person waits there, and a push that failed keeps being pushed.
export const SwitchAwayFromStripe: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(
        onStripe(),
        [
          invoice('inv-pushed', {
            provider: buildProviderRecord(),
            providerKind: 'STRIPE',
            status: 'PUSHED',
          }),
          invoice('inv-review', {
            provider: buildProviderRecord({ status: 'draft' }),
            providerKind: 'STRIPE',
            status: 'DRAFT',
          }),
        ],
        handleGetInvoice(({ params }) =>
          HttpResponse.json(
            invoice(String(params.invoiceId), {
              provider: buildProviderRecord({ status: 'draft' }),
              providerKind: 'STRIPE',
              status: 'DRAFT',
            }),
          ),
        ),
      ),
    },
  },
  render: dialog,
  play: async () => {
    const frame = await findDialog();

    await choose(
      await within(frame).findByRole('combobox', { name: /Collected by/ }),
      'Manual hand-off',
    );

    await waitFor(async () => {
      const rows = await within(frame).findAllByTestId('open-invoice');
      await expect(rows.map((row) => row.getAttribute('data-fate'))).toEqual([
        'collected',
        'review',
      ]);
    });
    // The organization's own system only sends the invoice.
    await expect(
      within(frame).getByRole('combobox', { name: /Collection method/ }),
    ).toHaveTextContent('Send the invoice');
  },
};

// Stripe sends the invoices to the billing e-mail of the customer: without one the
// dialog says so, and where to add it.
export const CustomerWithoutAnAddress: Story = {
  parameters: {
    msw: {
      handlers: handlersFor(
        subscription(),
        [],
        handleGetCustomer({ body: storyCustomers[0] }),
      ),
    },
  },
  render: dialog,
  play: async () => {
    const frame = await findDialog();

    await choose(
      await within(frame).findByRole('combobox', { name: /Collected by/ }),
      'Stripe',
    );

    await expect(await within(frame).findByTestId('terms-warning')).toHaveTextContent(
      'no billing e-mail',
    );
  },
};
