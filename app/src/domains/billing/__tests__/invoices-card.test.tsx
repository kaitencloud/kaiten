import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseQueryResult } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { InvoiceSummary, PageInvoiceSummary } from '@/api-client';
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

type Query = UseQueryResult<PageInvoiceSummary, unknown>;

/** The parts of a query the card reads. */
const query = (overrides: Partial<Query> = {}) =>
  ({
    data: undefined,
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
    ...overrides,
  }) as unknown as Query;

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

/** `count` invoices of one customer, one a day from the first of March. */
const invoices = (count: number): InvoiceSummary[] =>
  Array.from({ length: count }, (_, index) =>
    invoiceRow(`inv-${index + 1}`, 'Acme', {
      boundaryAt: new Date(Date.UTC(2027, 2, index + 1)).toISOString(),
    }),
  );

const bodyRows = () => screen.getAllByRole('row').slice(1);

describe('the invoices of a subject', () => {
  it('shows a busy region named by what is being read while the invoices load', () => {
    render(card(query({ isPending: true })));

    expect(
      screen.getByRole('status', { name: 'Loading invoices' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Every invoice of this instance.')).toBeInTheDocument();
  });

  it('says why there is none, in the words of the screen it is on', () => {
    render(card(query({ data: pageOf([]) })));

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

  it('keeps the rows it has when a refresh fails', () => {
    render(
      card(
        query({
          data: pageOf([invoiceRow('inv-1', 'Acme')]),
          error: new ApiError({ data: { detail: 'Slow', status: 503 }, status: 503 }),
          isError: true,
        }),
      ),
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByTestId('things-error')).toBeNull();
  });

  it('lists every invoice it holds, with no count of them and no "Load more"', () => {
    render(card(query({ data: pageOf(invoices(3)) })));

    expect(bodyRows()).toHaveLength(3);
    expect(screen.queryByText(/invoices? shown/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('pages the invoices in the browser, ten to a page, newest first', async () => {
    render(card(query({ data: pageOf(invoices(12)) })));

    expect(bodyRows()).toHaveLength(10);
    expect(within(bodyRows()[0]).getByRole('link')).toHaveAttribute(
      'href',
      '/billing/invoices/inv-12',
    );
    expect(screen.getByText('Showing 1-10 of 12 records')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(bodyRows()).toHaveLength(2);
    expect(within(bodyRows()[0]).getByRole('link')).toHaveAttribute(
      'href',
      '/billing/invoices/inv-2',
    );
    expect(screen.getByText('Showing 11-12 of 12 records')).toBeInTheDocument();
  });

  it('sorts by the column of a header, the boundary newest first as it opens', async () => {
    render(card(query({ data: pageOf(invoices(3)) })));

    const firstLink = () =>
      within(bodyRows()[0]).getByRole('link').getAttribute('href');
    expect(firstLink()).toBe('/billing/invoices/inv-3');
    expect(
      screen.getByRole('columnheader', { name: /Invoice/ }),
    ).toHaveAttribute('aria-sort', 'descending');

    await userEvent.click(
      screen.getByRole('button', { name: 'Sorted descending: Invoice' }),
    );

    expect(firstLink()).toBe('/billing/invoices/inv-1');
  });

  it('leaves out the columns the page already says', () => {
    render(
      <InvoicesCard
        description="d"
        emptyDescription="e"
        hiddenColumns={['invoice', 'provider']}
        query={query({ data: pageOf([invoiceRow('inv-1', 'Acme')]) })}
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
