import type { Meta, StoryObj } from '@storybook/react-vite';
import { Suspense } from 'react';
import { expect, within } from 'storybook/test';
import type { Invoice } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetInvoice,
} from '@/api-client/msw.gen';
import {
  billingCapabilitiesProfiles,
  buildInvoice,
  buildInvoiceLine,
  buildProviderRecord,
} from '@/test-fixtures/storybook-billing-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { InvoiceDetailPage } from '../invoice-detail/invoice-detail-page';
import { InvoiceProviderCard } from '../invoice-detail/invoice-provider-card';
import { InvoiceProviderAlerts } from '../invoice-detail/provider-alerts';
import { ReconciliationCard } from '../invoice-detail/reconciliation-card';

const meta = {
  title: 'Features/Billing/InvoiceProvider',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const BOUNDARY = '2027-03-01T00:00:00.000Z';
const PUSHED_AT = '2027-03-01T00:06:00.000Z';

const line = buildInvoiceLine({
  amount: 2900,
  description: '1 × $29.00 per month',
  invoiceId: 'inv-stripe',
  label: 'Pro, monthly',
  seq: 1,
  serviceFrom: BOUNDARY,
  serviceTo: '2027-04-01T00:00:00.000Z',
  type: 'BASE',
});

const stripe = (
  overrides: Partial<Parameters<typeof buildInvoice>[0]> = {},
): Invoice =>
  buildInvoice({
    boundaryAt: BOUNDARY,
    collectionMethod: 'SEND_INVOICE',
    id: 'inv-stripe',
    lines: [line],
    provider: buildProviderRecord({ pushedAt: PUSHED_AT, total: 2900 }),
    status: 'PUSHED',
    ...overrides,
  });

const frame = (children: React.ReactNode) => (
  <StorybookRouter>
    <div className="max-w-xl space-y-4">{children}</div>
  </StorybookRouter>
);

// An invoice Stripe holds open: its status there, its number and identifiers, when it
// was pushed and last read, and the two pages Stripe hosts for it.
export const Open: Story = {
  render: () => frame(<InvoiceProviderCard invoice={stripe()} />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('Open')).toBeVisible();
    await expect(canvas.getByText('in_1Qx0')).toBeVisible();
    const hosted = canvas.getByRole('link', { name: 'Hosted invoice' });
    await expect(hosted).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(hosted).toHaveAttribute('target', '_blank');
    await expect(canvas.getByRole('link', { name: 'PDF' })).toBeVisible();
  },
};

// The review mode of the connector: Stripe holds the draft and waits for a person.
export const AwaitingFinalization: Story = {
  render: () =>
    frame(
      <InvoiceProviderAlerts
        invoice={stripe({
          issuedAt: null,
          provider: buildProviderRecord({ pushAttempts: 1, status: 'draft' }),
          status: 'DRAFT',
        })}
        phase="idle"
      />,
    ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('invoice-awaiting-finalization'),
    ).toHaveTextContent('Awaiting finalization in Stripe');
  },
};

// Stripe refused the push: what it answered, how many attempts, and when the next is.
export const PushFailed: Story = {
  render: () =>
    frame(
      <InvoiceProviderAlerts
        invoice={stripe({
          issuedAt: null,
          provider: {
            lastPushError:
              'customer_tax_location_invalid: the address of the customer cannot be used to compute tax',
            nextPushAt: '2027-03-02T06:00:00.000Z',
            pushAttempts: 6,
          },
          status: 'PUSH_FAILED',
        })}
        phase="idle"
      />,
    ),
  play: async ({ canvasElement }) => {
    const error = within(canvasElement).getByTestId('invoice-push-error');

    await expect(error).toHaveTextContent('customer_tax_location_invalid');
    await expect(error).toHaveTextContent('6 attempts.');
  },
};

// A push the person asked for is running: the page is waiting for it.
export const PushWaiting: Story = {
  render: () =>
    frame(
      <InvoiceProviderAlerts
        invoice={stripe({
          issuedAt: null,
          provider: { nextPushAt: '2027-03-01T00:12:00.000Z', pushAttempts: 1 },
          status: 'DRAFT',
        })}
        phase="waiting"
      />,
    ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('invoice-push-status'),
    ).toHaveTextContent('Pushing to Stripe…');
  },
};

// The charge needs the customer: the code Stripe used, and what it asks of them.
export const PaymentFailed: Story = {
  render: () =>
    frame(
      <InvoiceProviderAlerts
        invoice={stripe({
          collectionMethod: 'CHARGE_AUTOMATICALLY',
          provider: buildProviderRecord({
            lastPaymentError: 'authentication_required',
          }),
          status: 'PAYMENT_FAILED',
        })}
        phase="idle"
      />,
    ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('invoice-payment-error'),
    ).toHaveTextContent('must confirm the payment on the hosted invoice page');
  },
};

// Someone added a coupon in the Stripe dashboard: the totals differ, and Stripe has a
// discount Kaiten never created.
export const ReconciliationMismatch: Story = {
  render: () =>
    frame(
      <ReconciliationCard
        invoice={stripe({
          provider: buildProviderRecord({
            reconciledAt: '2027-03-02T00:00:00.000Z',
            reconciliationDetail: {
              discounts: [],
              extraDiscounts: [
                { amount: 2500, discountId: 'di_1Qz', externalLineId: 'il_9' },
              ],
              extraInProvider: ['ii_9'],
              inclusiveTax: false,
              lines: [],
              missingInProvider: [],
              totals: { kaitenTotal: 2900, providerTotalExcludingTax: 400 },
            },
            reconciliationStatus: 'MISMATCH',
          }),
        })}
      />,
    ),
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getByTestId('reconciliation');

    await expect(card).toHaveTextContent('Differ');
    await expect(card).toHaveTextContent('di_1Qz');
    await expect(card).toHaveTextContent('ii_9');
  },
};

export const ReconciliationMatched: Story = {
  render: () => frame(<ReconciliationCard invoice={stripe()} />),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('reconciliation'),
    ).toHaveTextContent('Stripe holds the same amounts as Kaiten.');
  },
};

const pageInvoice = stripe({
  provider: buildProviderRecord({
    reconciledAt: '2027-03-02T00:00:00.000Z',
    reconciliationDetail: {
      discounts: [],
      extraDiscounts: [],
      extraInProvider: [],
      inclusiveTax: false,
      lines: [],
      missingInProvider: [],
      totals: { kaitenTotal: 2900, providerTotalExcludingTax: 3419 },
    },
    reconciliationStatus: 'MISMATCH',
  }),
});

// The page of an invoice Stripe collects: the actions it offers, the card of where it
// stands in Stripe beside the summary, and the reconciliation across the page.
export const Page: Story = {
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        handleGetBillingCapabilities({
          body: billingCapabilitiesProfiles.stackWithStripe('connected'),
        }),
        handleGetInvoice({ body: pageInvoice }),
      ],
    },
  },
  render: () => (
    <StorybookRouter>
      <div className="h-screen">
        <Suspense fallback={null}>
          <InvoiceDetailPage invoiceId={pageInvoice.id} />
        </Suspense>
      </div>
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByTestId('invoice-provider')).toBeVisible();
    await expect(canvas.getByTestId('reconciliation')).toBeVisible();
    await expect(
      await canvas.findByRole('button', { name: 'Read from Stripe' }),
    ).toBeVisible();
  },
};
