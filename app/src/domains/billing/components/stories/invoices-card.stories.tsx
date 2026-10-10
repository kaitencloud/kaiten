import type { UseQueryResult } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { InvoiceSummary, PageInvoiceSummary } from '@/api-client';
import { ApiError } from '@/lib/errors';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { InvoicesCard } from '..';

const meta = {
  title: 'Domains/Billing/InvoicesCard',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const invoice = (overrides: Partial<InvoiceSummary>): InvoiceSummary => ({
  boundaryAt: '2027-03-01T00:00:00.000Z',
  collectionMethod: 'SEND_INVOICE',
  createdAt: '2027-03-01T00:00:00.000Z',
  currency: 'USD',
  customerName: 'Initech',
  customerSlug: 'initech',
  daysUntilDue: null,
  discountTotal: 0,
  dueAt: '2099-03-31T00:00:00.000Z',
  handoffStatus: 'PENDING',
  holdReason: null,
  id: 'inv-1',
  instanceName: 'Initech Production',
  instanceSlug: 'initech-production',
  issuedAt: '2027-03-01T00:00:00.000Z',
  kind: 'RENEWAL',
  licenseSlug: 'pro-v2',
  paidAt: null,
  providerKind: 'NOOP',
  serviceFrom: '2027-02-01T00:00:00.000Z',
  serviceTo: '2027-03-01T00:00:00.000Z',
  status: 'MANUAL',
  subtotal: 12900,
  total: 12900,
  updatedAt: '2027-03-01T00:00:00.000Z',
  ...overrides,
});

/** The parts of a query a card reads: the invoices, every page of them, and its state. */
const stub = (state: Record<string, unknown>) =>
  ({
    data: undefined,
    error: null,
    isError: false,
    isPending: false,
    refetch: fn(),
    ...state,
  }) as unknown as UseQueryResult<PageInvoiceSummary, unknown>;

const page = (items: InvoiceSummary[]): PageInvoiceSummary => ({
  hasMore: false,
  items,
});

const card = (query: UseQueryResult<PageInvoiceSummary, unknown>) => (
  <StorybookRouter>
    <InvoicesCard
      description="The invoices of every instance of this customer, newest first."
      emptyDescription="None of the instances of this customer has been invoiced yet."
      hiddenColumns={[]}
      query={query}
      testIdPrefix="card"
    />
  </StorybookRouter>
);

// The invoices of one subject, read whole: the table sorts them, newest invoice
// first, and pages them in the browser.
export const Populated: Story = {
  render: () =>
    card(
      stub({
        data: page([
          invoice({ id: 'inv-2', instanceName: 'Initech Staging', instanceSlug: 'initech-staging' }),
          invoice({ id: 'inv-1' }),
        ]),
      }),
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('initech-staging')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Load more' })).toBeNull();
  },
};

// More invoices than a page of the table holds: ten to a page, the pager under
// them, and the order kept when the next page is shown.
export const Paged: Story = {
  render: () =>
    card(
      stub({
        data: page(
          Array.from({ length: 12 }, (_, index) =>
            invoice({
              boundaryAt: new Date(Date.UTC(2027, 2, index + 1)).toISOString(),
              id: `inv-${index + 1}`,
            }),
          ),
        ),
      }),
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Showing 1-10 of 12 records')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    await expect(await canvas.findByText('Showing 11-12 of 12 records')).toBeVisible();
  },
};

export const Loading: Story = {
  render: () => card(stub({ isPending: true })),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('status', { name: 'Loading invoices' }),
    ).toHaveAttribute('aria-busy', 'true');
  },
};

export const Empty: Story = {
  render: () => card(stub({ data: page([]) })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('No invoices yet')).toBeVisible();
    await expect(
      canvas.getByText('None of the instances of this customer has been invoiced yet.'),
    ).toBeVisible();
  },
};

// A refusal of the read is shown in the card, with a way to ask again, and the
// page around the card is left as it was.
export const Refused: Story = {
  render: () =>
    card(
      stub({
        error: new ApiError({
          data: {
            code: 'Billing.EntitlementCheckUnavailable',
            detail: 'The billing entitlement could not be checked',
            status: 503,
          },
          response: new Response(null, { status: 503 }),
          status: 503,
        }),
        isError: true,
      }),
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByText('The billing entitlement could not be checked'),
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};
