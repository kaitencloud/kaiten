import { screen, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { PageInvoiceSummary } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleListInvoices,
} from '@/api-client/msw.gen';
import {
  createLoadedPageClient,
  invoiceRow,
  pageOf,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import type { InvoicesSearch } from '../../schemas/invoices-search.schema';
import { InvoicesPageContent } from '../invoices/invoices-page-content';

vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);

useBillingTexts();

/** Answers each read of the list with the next of `pages`, and records what the API was asked. */
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

const renderPage = (search: InvoicesSearch = {}) =>
  renderWithClient(
    <Suspense fallback={null}>
      <InvoicesPageContent onScopeChange={vi.fn()} search={search} />
    </Suspense>,
    createLoadedPageClient(),
  );

describe('the page of the invoices', () => {
  it('titles the list', async () => {
    serveInvoices(pageOf([invoiceRow('inv-1', 'Initech')]));
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Invoices' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Every invoice of your organization, across its customers and instances.',
      ),
    ).toBeInTheDocument();
  });

  it('reads every page of the invoices of the scope, 200 at a time, and lists them all', async () => {
    const asked = serveInvoices(
      pageOf([invoiceRow('inv-1', 'Initech')], 'cursor-2'),
      pageOf([invoiceRow('inv-2', 'Globex')]),
    );
    renderPage({ customerSlug: 'initech' });

    expect(await screen.findByText('Globex')).toBeInTheDocument();
    expect(screen.getByText('Initech')).toBeInTheDocument();
    expect(asked).toHaveLength(2);
    expect(asked[0].get('limit')).toBe('200');
    expect(asked[0].has('cursor')).toBe(false);
    expect(asked[0].get('customerSlug')).toBe('initech');
    expect(asked[1].get('cursor')).toBe('cursor-2');
    expect(asked[1].get('customerSlug')).toBe('initech');
  });

  it('asks the API for the scope and for no other filter: the rest is the page\'s', async () => {
    const asked = serveInvoices(pageOf([invoiceRow('inv-1', 'Initech')]));
    renderPage({ instanceSlug: 'initech-production' });

    await screen.findByText('Initech');

    expect([...asked[0].keys()].sort()).toEqual(['instanceSlug', 'limit']);
  });
});

describe('the page of the invoices, opened by a link', () => {
  it('opens on the filter the link asks for, and says so with a chip', async () => {
    serveInvoices(
      pageOf([
        invoiceRow('inv-1', 'Initech', { status: 'PUSH_FAILED' }),
        invoiceRow('inv-2', 'Globex'),
      ]),
    );
    renderPage({ status: 'PUSH_FAILED' });

    expect(await screen.findByText('Initech')).toBeInTheDocument();
    expect(screen.queryByText('Globex')).toBeNull();
    expect(document.querySelectorAll('[data-slot="filter-chip"]')).toHaveLength(1);
  });

  it('asks the API for the scope alone: the filter of the link is the page\'s', async () => {
    const asked = serveInvoices(pageOf([invoiceRow('inv-1', 'Initech')]));
    renderPage({ customerSlug: 'initech', status: 'PUSH_FAILED', view: 'held' });

    await waitFor(() => expect(asked).toHaveLength(1));
    expect([...asked[0].keys()].sort()).toEqual(['customerSlug', 'limit']);
  });
});

describe('who collects, on the page of the invoices', () => {
  const rows = [
    invoiceRow('inv-1', 'Initech'),
    invoiceRow('inv-2', 'Globex'),
  ];
  const providerHeader = () =>
    screen.queryByRole('columnheader', { name: 'Provider' });

  it('is not a column while NoOp collects every invoice', async () => {
    serveInvoices(pageOf(rows));
    renderPage();

    await screen.findByText('Initech');
    expect(providerHeader()).toBeNull();
  });

  it('is a column once Stripe is connected', async () => {
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilitiesProfiles.stackWithStripe('connected'),
      }),
    );
    serveInvoices(pageOf(rows));
    renderPage();

    await screen.findByText('Initech');
    expect(await screen.findByRole('columnheader', { name: 'Provider' })).toBeInTheDocument();
  });

  it('stays a column for the invoices of a Stripe that is not connected any more', async () => {
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilitiesProfiles.stackWithStripe('available'),
      }),
    );
    serveInvoices(
      pageOf([invoiceRow('inv-1', 'Initech', { providerKind: 'STRIPE' }), rows[1]]),
    );
    renderPage();

    await screen.findByText('Initech');
    expect(await screen.findByRole('columnheader', { name: 'Provider' })).toBeInTheDocument();
  });

  it('is not a column where Stripe could be connected and collects nothing', async () => {
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilitiesProfiles.stackWithStripe('available'),
      }),
    );
    serveInvoices(pageOf(rows));
    renderPage();

    await screen.findByText('Initech');
    expect(providerHeader()).toBeNull();
  });
});

describe('the status views, on the page of the invoices', () => {
  const NOW = Date.now();
  const rows = [
    invoiceRow('inv-ok', 'Initech'),
    invoiceRow('inv-late', 'Globex', {
      dueAt: new Date(NOW - 5 * 24 * 3600 * 1000).toISOString(),
      status: 'PUSHED',
    }),
    invoiceRow('inv-held', 'Umbrella', { holdReason: 'LEDGER_SEQUENCE_GAP' }),
    invoiceRow('inv-waiting', 'Hooli', { handoffStatus: 'PENDING' }),
    invoiceRow('inv-booked', 'Pied Piper', { handoffStatus: 'ACKNOWLEDGED' }),
  ];

  it('count the invoices of the list in each view, from that one read', async () => {
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilitiesProfiles.stack(),
      }),
    );
    const asked = serveInvoices(pageOf(rows));
    renderPage();

    await screen.findByRole('link', { name: 'Handoff 1' });

    expect(screen.getByRole('link', { name: 'All 5' })).toHaveAttribute(
      'href',
      '/invoices',
    );
    expect(screen.getByRole('link', { name: 'Overdue 1' })).toHaveAttribute(
      'href',
      '/invoices?view=overdue',
    );
    expect(screen.getByRole('link', { name: 'Held 1' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Handoff 1' }),
    ).toHaveAttribute('href', '/invoices?view=waiting');
    expect(screen.getByRole('link', { name: 'Acknowledged 1' })).toBeVisible();
    expect(asked).toHaveLength(1);
  });

  it('draw every invoice on the bare path', async () => {
    serveInvoices(pageOf(rows));
    renderPage();

    expect(await screen.findByText('Initech')).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();
    expect(screen.getByText('Pied Piper')).toBeInTheDocument();
  });

  it('keep the overdue invoices in the overdue view', async () => {
    serveInvoices(pageOf(rows));
    renderPage({ view: 'overdue' });

    expect(await screen.findByText('Globex')).toBeInTheDocument();
    expect(screen.queryByText('Initech')).toBeNull();
    expect(screen.queryByText('Umbrella')).toBeNull();
  });

  it('keep the held invoices in the held view, and leave the filters to narrow them further', async () => {
    serveInvoices(pageOf(rows));
    renderPage({ view: 'held' });

    expect(await screen.findByText('Umbrella')).toBeInTheDocument();
    expect(screen.queryByText('Initech')).toBeNull();
    expect(document.querySelectorAll('[data-slot="filter-chip"]')).toHaveLength(0);
  });

  it('say so when a view holds nothing', async () => {
    serveInvoices(pageOf([invoiceRow('inv-ok', 'Initech')]));
    renderPage({ view: 'held' });

    expect(await screen.findByTestId('invoices-empty')).toBeInTheDocument();
    expect(screen.queryByText('Initech')).toBeNull();
  });

  it('are All, Overdue and Held where billing says nothing of NoOp, and the list stays as it was', async () => {
    serveInvoices(pageOf([invoiceRow('inv-1', 'Initech')]));
    renderPage();

    await screen.findByText('Initech');

    expect(screen.getByRole('link', { name: 'All 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Held 0' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Handoff \d+$/ })).toBeNull();
    expect(
      screen.getByPlaceholderText('Customer, instance or invoice'),
    ).toBeInTheDocument();
  });
});
