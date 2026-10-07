import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { PageInvoiceSummary } from '@/api-client';
import { handleListInvoices } from '@/api-client/msw.gen';
import { InvoicesList } from '../invoices/invoices-list';
import {
  invoiceRow,
  pageOf,
  refusal,
  renderWithClient,
  useBillingTexts,
} from './billing-test-support';

vi.mock('@tanstack/react-router', async () =>
  (await import('./billing-test-support')).createRouterModule(vi.fn()),
);

useBillingTexts();

/**
 * Answers each read of the list with the next of `pages` (the last one again when
 * there are no more), and records what the API was asked: the query of each read.
 */
function serveInvoices(...pages: PageInvoiceSummary[]) {
  const asked: URLSearchParams[] = [];
  server.use(
    handleListInvoices(({ request }) => {
      asked.push(new URL(request.url).searchParams);

      return HttpResponse.json(pages[Math.min(asked.length, pages.length) - 1]);
    }),
  );

  return asked;
}

const renderList = (
  props: Partial<Parameters<typeof InvoicesList>[0]> = {},
) => {
  const onClearFilters = vi.fn();
  renderWithClient(
    <InvoicesList
      filters={{}}
      onClearFilters={onClearFilters}
      showProvider={false}
      {...props}
    />,
  );

  return { onClearFilters };
};

describe('the list of invoices', () => {
  it('says it is busy while the first page is on the way', async () => {
    server.use(
      handleListInvoices(async () => {
        await delay('infinite');

        return HttpResponse.json(pageOf([]));
      }),
    );
    renderList();

    expect(
      screen.getByRole('status', { name: 'Loading invoices' }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the invoices it read, and how many', async () => {
    serveInvoices(
      pageOf([invoiceRow('inv-1', 'Initech'), invoiceRow('inv-2', 'Globex')]),
    );
    renderList();

    expect(await screen.findByText('Initech')).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();
    expect(screen.getByTestId('invoices-count')).toHaveTextContent(
      '2 invoices shown',
    );
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('asks the API for the filters it was given, a page of fifty, and no cursor on the first page', async () => {
    const asked = serveInvoices(pageOf([invoiceRow('inv-1', 'Initech')]));
    renderList({ filters: { customerSlug: 'initech', status: ['PAID'] } });

    await screen.findByText('Initech');

    expect(asked).toHaveLength(1);
    expect(asked[0].get('customerSlug')).toBe('initech');
    expect(asked[0].getAll('status')).toEqual(['PAID']);
    expect(asked[0].get('limit')).toBe('50');
    expect(asked[0].has('cursor')).toBe(false);
  });

  it('reads the next page with the same filters when asked, and keeps the rows it has', async () => {
    const asked = serveInvoices(
      pageOf([invoiceRow('inv-1', 'Initech')], 'cursor-2'),
      pageOf([invoiceRow('inv-2', 'Globex')]),
    );
    renderList({ filters: { kind: 'RENEWAL' } });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Load more' }),
    );

    expect(await screen.findByText('Globex')).toBeInTheDocument();
    expect(screen.getByText('Initech')).toBeInTheDocument();
    expect(asked[1].get('cursor')).toBe('cursor-2');
    expect(asked[1].get('kind')).toBe('RENEWAL');
    expect(asked[1].get('limit')).toBe('50');
    expect(screen.getByTestId('invoices-count')).toHaveTextContent(
      '2 invoices shown',
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull(),
    );
  });

  it('keeps the rows it has and says why when the next page cannot be read', async () => {
    let reads = 0;
    server.use(
      handleListInvoices(() => {
        reads += 1;

        return reads === 1
          ? HttpResponse.json(
              pageOf([invoiceRow('inv-1', 'Initech')], 'cursor-2'),
            )
          : refusal(503, { detail: 'the invoice store is busy' });
      }),
    );
    renderList();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Load more' }),
    );

    expect(
      await screen.findByText('the invoice store is busy'),
    ).toBeInTheDocument();
    expect(screen.getByText('Initech')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled();
  });

  it('shows why the API refused, with its trace, and reads again when asked', async () => {
    let reads = 0;
    server.use(
      handleListInvoices(() => {
        reads += 1;

        return reads === 1
          ? refusal(500, {
              detail: 'the invoice store is unavailable',
              errorId: 'trace-1',
            })
          : HttpResponse.json(pageOf([invoiceRow('inv-1', 'Initech')]));
      }),
    );
    renderList();

    expect(await screen.findByTestId('invoices-error')).toHaveTextContent(
      'the invoice store is unavailable',
    );
    expect(screen.getByText('Reference trace-1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Initech')).toBeInTheDocument();
    expect(screen.queryByTestId('invoices-error')).toBeNull();
  });

  it('names the scope a session lacks, and offers no retry', async () => {
    server.use(
      handleListInvoices(() =>
        refusal(403, {
          code: 'Auth.MissingScope',
          detail: 'missing required scope: read:billing',
        }),
      ),
    );
    renderList();

    expect(await screen.findByText('read:billing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('says there is nothing yet, and where an invoice comes from', async () => {
    serveInvoices(pageOf([]));
    renderList();

    expect(await screen.findByTestId('invoices-empty')).toHaveTextContent(
      'No invoices yet',
    );
    expect(
      screen.getByRole('link', { name: 'Go to instances' }),
    ).toHaveAttribute('href', '/customers/instances');
  });

  it('says a filter is why there is nothing, and clears the filters from the message', async () => {
    serveInvoices(pageOf([]));
    const { onClearFilters } = renderList({
      filters: { customerSlug: 'nobody' },
    });

    expect(await screen.findByTestId('invoices-empty')).toHaveTextContent(
      'No invoice matches these filters',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Clear filters' }),
    );

    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('shows the provider column only where it is asked to', async () => {
    serveInvoices(pageOf([invoiceRow('inv-1', 'Initech')]));
    renderList({ showProvider: true });

    expect(
      await screen.findByRole('columnheader', { name: 'Provider' }),
    ).toBeInTheDocument();
  });

  it('leaves it out where NoOp is the only provider', async () => {
    serveInvoices(pageOf([invoiceRow('inv-1', 'Initech')]));
    renderList({ showProvider: false });

    await screen.findByText('Initech');
    expect(screen.queryByRole('columnheader', { name: 'Provider' })).toBeNull();
  });
});
