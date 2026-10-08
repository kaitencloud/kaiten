import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { InvoiceSummary } from '@/api-client';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { InvoicesList } from '../invoices/invoices-list';

const meta = {
  title: 'Features/Billing/InvoicesList',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// Far enough ahead never to be past due, and far enough back always to be.
const NOT_YET_DUE = '2099-03-31T00:00:00.000Z';
const PAST_DUE = '2020-03-31T00:00:00.000Z';

const invoice = (overrides: Partial<InvoiceSummary>): InvoiceSummary => ({
  boundaryAt: '2027-03-01T00:00:00.000Z',
  collectionMethod: 'SEND_INVOICE',
  createdAt: '2027-03-01T00:00:00.000Z',
  currency: 'USD',
  customerName: 'Initech',
  customerSlug: 'initech',
  discountTotal: 0,
  dueAt: NOT_YET_DUE,
  handoffStatus: 'PENDING',
  id: 'inv-1',
  instanceName: 'Initech Production',
  instanceSlug: 'initech-production',
  issuedAt: '2027-03-01T00:00:00.000Z',
  kind: 'RENEWAL',
  licenseSlug: 'pro-v2',
  providerKind: 'NOOP',
  serviceFrom: '2027-02-01T00:00:00.000Z',
  serviceTo: '2027-03-01T00:00:00.000Z',
  status: 'MANUAL',
  subtotal: 12900,
  total: 12900,
  updatedAt: '2027-03-01T00:00:00.000Z',
  ...overrides,
});

const INVOICES: InvoiceSummary[] = [
  invoice({ boundaryAt: '2027-04-01T00:00:00.000Z', id: 'inv-ready' }),
  invoice({
    boundaryAt: '2027-04-01T00:00:00.000Z',
    customerName: 'Hooli',
    customerSlug: 'hooli',
    dueAt: undefined,
    holdReason: 'LEDGER_SEQUENCE_GAP',
    id: 'inv-held',
    instanceSlug: 'hooli-production',
    issuedAt: undefined,
    status: 'DRAFT',
  }),
  invoice({
    boundaryAt: '2027-03-01T00:00:00.000Z',
    customerName: 'Globex',
    customerSlug: 'globex',
    dueAt: PAST_DUE,
    id: 'inv-overdue',
    instanceSlug: 'globex-production',
  }),
  invoice({
    boundaryAt: '2027-02-01T00:00:00.000Z',
    handoffStatus: 'ACKNOWLEDGED',
    id: 'inv-paid',
    paidAt: '2027-02-05T00:00:00.000Z',
    status: 'PAID',
  }),
];

const onScopeChange = fn();

const list = (props: Partial<Parameters<typeof InvoicesList>[0]> = {}) => (
  <StorybookRouter>
    <div className="h-[560px] px-6">
      <InvoicesList
        canExport
        invoices={INVOICES}
        onScopeChange={onScopeChange}
        scope={{}}
        showProvider={false}
        {...props}
      />
    </div>
  </StorybookRouter>
);

// The invoices of the organization as a list page like the others: the search and
// the Filter button above, the page actions on their right, and the table under
// them, the boundary each invoice bills newest first.
export const Default: Story = {
  render: () => list(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Held')).toBeVisible();
    await expect(canvas.getByText('Overdue')).toBeVisible();
    await expect(canvas.getByText('Paid')).toBeVisible();
    await expect(
      canvas.getByPlaceholderText('Customer, instance or invoice'),
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Filter' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Export' })).toBeVisible();
  },
};

// A customer or an instance the URL scopes the list to: a chip that takes it off.
export const ScopedToACustomer: Story = {
  render: () =>
    list({ invoices: INVOICES.slice(2), scope: { customerSlug: 'globex' } }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Customer: globex')).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove the filter Customer: globex' }),
    );
    await expect(onScopeChange).toHaveBeenCalledWith({ customerSlug: undefined });
  },
};

// The search matches who an invoice is for and the invoice itself, in the browser.
export const Searching: Story = {
  render: () => list(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(
      await canvas.findByPlaceholderText('Customer, instance or invoice'),
      'hooli',
    );

    await waitFor(() => expect(canvas.getAllByRole('row')).toHaveLength(2));
    await expect(canvas.getByText('hooli-production')).toBeVisible();
  },
};

// The provider is a column and a filter only where Stripe collects invoices.
export const WithStripe: Story = {
  render: () =>
    list({
      invoices: [invoice({ id: 'inv-stripe', providerKind: 'STRIPE', status: 'PUSHED' })],
      showProvider: true,
    }),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('columnheader', { name: 'Provider' }),
    ).toBeVisible();
  },
};

export const Empty: Story = {
  render: () => list({ invoices: [] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('No invoices yet')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Go to instances' })).toBeVisible();
  },
};

export const EmptyForACustomer: Story = {
  render: () => list({ invoices: [], scope: { customerSlug: 'initech' } }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('No invoice for this customer')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Show every invoice' })).toBeVisible();
  },
};
