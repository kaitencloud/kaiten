import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
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
  discountTotal: 0,
  dueAt: '2099-03-31T00:00:00.000Z',
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

const fetchNextPage = fn();

/** The parts of a query a card reads: the pages, its state and the way to read more. */
const stub = (state: Record<string, unknown>) =>
  ({
    data: undefined,
    error: null,
    fetchNextPage,
    hasNextPage: false,
    isError: false,
    isFetchNextPageError: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: fn(),
    ...state,
  }) as unknown as UseInfiniteQueryResult<InfiniteData<PageInvoiceSummary>>;

const pages = (items: InvoiceSummary[]): InfiniteData<PageInvoiceSummary> => ({
  pageParams: [undefined],
  pages: [{ hasMore: false, items }],
});

const card = (query: UseInfiniteQueryResult<InfiniteData<PageInvoiceSummary>>) => (
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

// The invoices of one subject, a page at a time, and the way to read more.
export const Populated: Story = {
  render: () =>
    card(
      stub({
        data: pages([
          invoice({ id: 'inv-2', instanceName: 'Initech Staging', instanceSlug: 'initech-staging' }),
          invoice({ id: 'inv-1' }),
        ]),
        hasNextPage: true,
      }),
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('initech-staging')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Load more' }));
    await expect(fetchNextPage).toHaveBeenCalledTimes(1);
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
  render: () => card(stub({ data: pages([]) })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('No invoices yet')).toBeVisible();
    await expect(
      canvas.getByText('None of the instances of this customer has been invoiced yet.'),
    ).toBeVisible();
  },
};

// A refusal of the first page is shown in the card, with a way to ask again, and
// the page around the card is left as it was.
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
