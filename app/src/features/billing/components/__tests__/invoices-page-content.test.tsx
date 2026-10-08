import { screen } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { PageInvoiceSummary } from '@/api-client';
import { handleListInvoices } from '@/api-client/msw.gen';
import {
  createLoadedPageClient,
  invoiceRow,
  pageOf,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
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

const renderPage = (scope = {}) =>
  renderWithClient(
    <Suspense fallback={null}>
      <InvoicesPageContent onScopeChange={vi.fn()} scope={scope} />
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
