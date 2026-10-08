import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { PageInvoiceSummary } from '@/api-client';
import { ApiError } from '@/lib/errors';
import {
  invoiceRow,
  pageOf,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { InvoicesCard } from '../components';

vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);

useBillingTexts();

type Query = UseInfiniteQueryResult<InfiniteData<PageInvoiceSummary>>;

/** The parts of a query the card reads. */
const query = (overrides: Partial<Query> = {}) =>
  ({
    data: undefined,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isError: false,
    isFetchNextPageError: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: vi.fn(),
    ...overrides,
  }) as unknown as Query;

const dataOf = (...pages: PageInvoiceSummary[]) => ({
  pageParams: pages.map(() => undefined),
  pages,
});

const NONE = [] as const;

const card = (q: Query) => (
  <InvoicesCard
    description="Every invoice of this instance."
    emptyDescription="Nothing was invoiced yet."
    hiddenColumns={NONE}
    query={q}
    testIdPrefix="things"
  />
);

describe('the invoices of a subject', () => {
  it('shows a busy region named by what is being read while the first page loads', () => {
    render(card(query({ isPending: true })));

    expect(
      screen.getByRole('status', { name: 'Loading invoices' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Every invoice of this instance.')).toBeInTheDocument();
  });

  it('says why there is none, in the words of the screen it is on', () => {
    render(card(query({ data: dataOf(pageOf([])) })));

    const empty = screen.getByTestId('things-empty');
    expect(within(empty).getByText('No invoices yet')).toBeInTheDocument();
    expect(within(empty).getByText('Nothing was invoiced yet.')).toBeInTheDocument();
  });

  it('shows the refusal with a way to ask again when nothing was read', async () => {
    const refetch = vi.fn();
    render(
      card(
        query({
          error: new ApiError({
            data: { detail: 'Billing is down', status: 503 },
            status: 503,
          }),
          isError: true,
          refetch,
        }),
      ),
    );

    const problem = screen.getByTestId('things-error');
    expect(problem).toHaveTextContent('Billing is down');
    await userEvent.click(within(problem).getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('keeps the rows it has when a later page cannot be read', () => {
    render(
      card(
        query({
          data: dataOf(pageOf([invoiceRow('inv-1', 'Acme')], 'next')),
          error: new ApiError({ data: { detail: 'Slow', status: 503 }, status: 503 }),
          hasNextPage: true,
          isError: true,
          isFetchNextPageError: true,
        }),
      ),
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByTestId('things-error')).toBeNull();
  });

  it('lists the invoices read, says no count of them and offers the next page', async () => {
    const fetchNextPage = vi.fn();
    render(
      card(
        query({
          data: dataOf(
            pageOf([invoiceRow('inv-1', 'Acme'), invoiceRow('inv-2', 'Acme')], 'next'),
            pageOf([invoiceRow('inv-3', 'Acme')]),
          ),
          fetchNextPage,
          hasNextPage: true,
        }),
      ),
    );

    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.queryByText(/invoices? shown/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('leaves out the columns the page already says', () => {
    render(
      <InvoicesCard
        description="d"
        emptyDescription="e"
        hiddenColumns={['invoice', 'provider']}
        query={query({ data: dataOf(pageOf([invoiceRow('inv-1', 'Acme')])) })}
        testIdPrefix="things"
      />,
    );

    const headers = screen
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).not.toContain('Customer');
    expect(headers).not.toContain('Provider');
    expect(headers).toContain('Status');
  });
});
