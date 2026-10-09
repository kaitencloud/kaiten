import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { InvoiceSummary } from '@/api-client';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { InvoicesTable } from '..';

const meta = {
  title: 'Domains/Billing/InvoicesTable',
  parameters: { layout: 'padded' },
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
  handoffStatus: 'NOT_REQUIRED',
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
  invoice({ handoffStatus: 'PENDING', id: 'inv-ready' }),
  invoice({
    dueAt: undefined,
    holdReason: 'LEDGER_SEQUENCE_GAP',
    id: 'inv-held',
    issuedAt: undefined,
    status: 'DRAFT',
  }),
  invoice({ dueAt: PAST_DUE, handoffStatus: 'PENDING', id: 'inv-overdue' }),
  invoice({
    handoffStatus: 'ACKNOWLEDGED',
    id: 'inv-paid',
    paidAt: '2027-03-05T00:00:00.000Z',
    status: 'PAID',
  }),
  invoice({ id: 'inv-written-off', status: 'UNCOLLECTIBLE' }),
  invoice({
    customerName: 'Globex',
    id: 'inv-void',
    instanceSlug: 'globex-staging',
    kind: 'ACTIVATION',
    status: 'VOID',
  }),
];

// The invoices of the organization, one row each: who they are for, what they
// bill, for how much, in what status and where they stand in the handoff queue.
// Ready to bill is a status like another, never a failure; a draft whose usage
// journal failed a check reads as held; an unpaid invoice past its due date as
// overdue.
export const Organization: Story = {
  render: () => (
    <StorybookRouter>
      <InvoicesTable invoices={INVOICES} />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Held')).toBeVisible();
    await expect(canvas.getByText('Overdue')).toBeVisible();
    await expect(canvas.getByText('Paid')).toBeVisible();
    await expect(canvas.getByText('Written off')).toBeVisible();
    await expect(canvas.getByText('Void')).toBeVisible();
    await expect(canvas.getAllByText('Ready to bill')).toHaveLength(1);
    await expect(canvas.getByText('Not issued')).toBeVisible();
    // A row leads to its invoice.
    await expect(
      canvas.getByRole('link', { name: /Globex/ }),
    ).toHaveAttribute('href', '/invoices/inv-void');
  },
};

// On the page of an instance the customer and the instance are already said, and
// so is who collects the invoices.
export const OnAnInstancePage: Story = {
  render: () => (
    <StorybookRouter>
      <InvoicesTable
        hiddenColumns={['invoice', 'provider', 'handoff']}
        invoices={INVOICES.slice(0, 3)}
        variant="simple"
      />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('columnheader', { name: 'Invoice' })).toBeVisible();
    await expect(canvas.queryByRole('columnheader', { name: 'Customer' })).toBeNull();
    await expect(canvas.queryByRole('columnheader', { name: 'Provider' })).toBeNull();
  },
};

export const Empty: Story = {
  render: () => (
    <StorybookRouter>
      <InvoicesTable
        emptyMessage="No invoice has been issued for this instance yet."
        invoices={[]}
      />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        'No invoice has been issued for this instance yet.',
      ),
    ).toBeVisible();
  },
};
