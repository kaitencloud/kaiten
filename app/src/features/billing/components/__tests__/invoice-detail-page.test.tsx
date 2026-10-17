import { screen, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Invoice } from '@/api-client';
import { handleGetInvoice } from '@/api-client/msw.gen';
import {
  createLoadedPageClient,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import {
  buildInvoice,
  buildInvoiceLine,
} from '../../../../../e2e/app/_support/fixtures/build-invoice';
import { InvoiceDetailPage } from '../invoice-detail/invoice-detail-page';

vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);

useBillingTexts();

const BOUNDARY = '2027-03-01T00:00:00.000Z';

const invoiceWith = (
  overrides: Partial<Parameters<typeof buildInvoice>[0]> = {},
): Invoice =>
  buildInvoice({
    boundaryAt: BOUNDARY,
    id: 'inv-1',
    lines: [
      buildInvoiceLine({
        amount: 12900,
        description: '1 × $129.00 per month',
        invoiceId: 'inv-1',
        label: 'Pro, monthly',
        seq: 1,
        serviceFrom: BOUNDARY,
        serviceTo: '2027-04-01T00:00:00.000Z',
        type: 'BASE',
      }),
    ],
    ...overrides,
  });

const waiting = { claimCount: 1, status: 'PENDING' as const };

async function renderPage(invoice: Invoice) {
  server.use(handleGetInvoice(() => HttpResponse.json(invoice)));
  renderWithClient(
    <Suspense fallback={null}>
      <InvoiceDetailPage invoiceId={invoice.id} />
    </Suspense>,
    createLoadedPageClient(),
  );
  await screen.findByRole('heading', { level: 1 });
}

const cardTitled = (title: string) => {
  const found = screen
    .getByText(title, { selector: '[data-slot="card-title"]' })
    .closest<HTMLElement>('[data-slot="card"]');
  if (!found) {
    throw new Error(`No card is titled ${title}`);
  }

  return found;
};

const comesBefore = (first: Element, second: Element) =>
  Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

/** The grid that holds the row of cards: the parent of the summary card. */
const rowOfCards = () => {
  const row = cardTitled('Summary').parentElement;
  if (!row) {
    throw new Error('The summary has no parent');
  }

  return row;
};

describe('the page of an invoice', () => {
  it('has the header, then the strip of figures, then the cards, then the lines across the page', async () => {
    await renderPage(invoiceWith({ handoff: waiting }));

    const title = screen.getByRole('heading', { level: 1 });
    const strip = document.querySelector('[data-slot="stat-card-row"]');
    const summary = cardTitled('Summary');
    const billedTo = cardTitled('Billed to');
    const handoff = screen.getByTestId('invoice-handoff');
    const lines = cardTitled('Lines');

    expect(strip).not.toBeNull();
    expect(comesBefore(title, strip as Element)).toBe(true);
    expect(comesBefore(strip as Element, summary)).toBe(true);
    expect(comesBefore(summary, billedTo)).toBe(true);
    expect(comesBefore(billedTo, handoff)).toBe(true);
    expect(comesBefore(handoff, lines)).toBe(true);
  });

  it('keeps the header and the strip of figures in place, and scrolls the rest under them', async () => {
    await renderPage(invoiceWith({ handoff: waiting }));

    const title = screen.getByRole('heading', { level: 1 });
    const strip = document.querySelector('[data-slot="stat-card-row"]');
    // The one region that scrolls holds the cards and the lines, not the header
    // nor the figures: they are above it, as an instance keeps its own.
    const scrolling = cardTitled('Summary').closest('.overflow-y-auto');
    expect(scrolling).not.toBeNull();
    expect(scrolling).toContainElement(cardTitled('Lines'));
    expect(scrolling).not.toContainElement(title);
    expect(scrolling).not.toContainElement(strip as HTMLElement);
  });

  it('holds the summary, who it is billed to and the handoff in one row, and the lines under it', async () => {
    await renderPage(invoiceWith({ handoff: waiting }));

    const row = rowOfCards();
    expect(within(row).getByText('Billed to')).toBeInTheDocument();
    expect(row).toContainElement(screen.getByTestId('invoice-handoff'));
    expect(row).not.toContainElement(cardTitled('Lines'));
    // The lines are not in a column of their own: nothing narrows them.
    expect(cardTitled('Lines').parentElement).toBe(row.parentElement);
  });

  it('puts the row on three columns from xl where the handoff has a card, and two columns from lg', async () => {
    await renderPage(invoiceWith({ handoff: waiting }));

    const row = rowOfCards();
    expect(row).toHaveClass('grid-cols-1', 'lg:grid-cols-2', 'xl:grid-cols-3');
    // The handoff does not leave a card alone on a row between lg and xl.
    expect(screen.getByTestId('invoice-handoff')).toHaveClass(
      'lg:col-span-2',
      'xl:col-span-1',
    );
  });

  it('does not stretch the row to a third column that nothing fills, when the invoice is in no queue', async () => {
    await renderPage(invoiceWith());

    expect(screen.queryByTestId('invoice-handoff')).toBeNull();
    const row = rowOfCards();
    expect(row).toHaveClass('lg:grid-cols-2');
    expect(row).not.toHaveClass('xl:grid-cols-3');
    expect(row.children).toHaveLength(2);
  });

  it('aligns the cards of the row at the top, each ending with its content, like the cards of an instance', async () => {
    await renderPage(invoiceWith({ handoff: waiting }));

    expect(rowOfCards()).toHaveClass('items-start');
  });

  it('shows the hold banner under the strip and above the cards, as an alert', async () => {
    await renderPage(
      invoiceWith({ holdReason: 'LEDGER_SEQUENCE_GAP', status: 'DRAFT' }),
    );

    const strip = document.querySelector('[data-slot="stat-card-row"]');
    const banner = screen.getByTestId('hold-banner');
    expect(comesBefore(strip as Element, banner)).toBe(true);
    expect(comesBefore(banner, cardTitled('Summary'))).toBe(true);
  });

  it('has no banner of its own for the chain of replacements: it is rows of the summary', async () => {
    await renderPage(
      invoiceWith({
        handoff: waiting,
        replacedByInvoiceId: 'inv-2',
        replacesInvoiceId: 'inv-0',
      }),
    );

    expect(screen.queryByTestId('invoice-chain')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    const summary = cardTitled('Summary');
    expect(within(summary).getByTestId('invoice-replaces')).toHaveTextContent(
      'inv-0',
    );
    expect(within(summary).getByTestId('invoice-replaced-by')).toHaveTextContent(
      'inv-2',
    );
  });

  it('says each figure once: the cards under the strip do not repeat the due date, the period or the kind', async () => {
    await renderPage(invoiceWith({ handoff: waiting }));

    const strip = document.querySelector<HTMLElement>(
      '[data-slot="stat-card-row"]',
    ) as HTMLElement;
    expect(within(strip).getByText('Service period')).toBeInTheDocument();
    for (const title of ['Summary', 'Billed to']) {
      const card = cardTitled(title);
      expect(within(card).queryByText('Service period')).toBeNull();
      expect(within(card).queryByText('Due')).toBeNull();
      expect(within(card).queryByText('Kind')).toBeNull();
    }
  });
});
