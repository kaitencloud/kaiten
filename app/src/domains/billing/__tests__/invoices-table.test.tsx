import { render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import type { InvoiceSummary } from '@/api-client';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { InvoicesTable } from '../components';
import { useInvoiceColumns } from '../components/invoices-table-columns';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
  useRouter: () => ({
    buildLocation: ({
      params,
      to,
    }: {
      params: { invoiceId: string };
      to: string;
    }) => ({ pathname: to.replace('$invoiceId', params.invoiceId) }),
  }),
}));

beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

const invoice = (overrides: Partial<InvoiceSummary> = {}): InvoiceSummary => ({
  boundaryAt: '2027-03-01T00:00:00.000Z',
  collectionMethod: 'SEND_INVOICE',
  createdAt: '2027-03-01T00:00:00.000Z',
  currency: 'USD',
  customerName: 'Initech',
  customerSlug: 'initech',
  discountTotal: 0,
  handoffStatus: 'PENDING',
  id: 'inv-1',
  instanceName: 'Initech Production',
  instanceSlug: 'initech-production',
  kind: 'RENEWAL',
  licenseSlug: 'pro',
  providerKind: 'NOOP',
  serviceFrom: '2027-02-01T00:00:00.000Z',
  serviceTo: '2027-03-01T00:00:00.000Z',
  status: 'MANUAL',
  subtotal: 12900,
  total: 12900,
  updatedAt: '2027-03-01T00:00:00.000Z',
  ...overrides,
});

describe('InvoicesTable', () => {
  it('shows who an invoice is for, what it bills, for how much and where it stands', () => {
    render(
      <InvoicesTable
        invoices={[
          invoice({
            dueAt: '2099-03-31T00:00:00.000Z',
            issuedAt: '2027-03-01T00:00:00.000Z',
          }),
        ]}
      />,
    );

    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByText('Initech')).toBeInTheDocument();
    expect(within(row).getByText('initech-production')).toBeInTheDocument();
    expect(within(row).getByText('Renewal')).toBeInTheDocument();
    // The boundary under the kind, and the period it closes over, one end above the other.
    expect(within(row).getAllByText('Mar 1, 2027 (UTC)')).toHaveLength(2);
    expect(within(row).getByText(/^Feb 1 –$/)).toBeInTheDocument();
    expect(within(row).getByText('$129.00')).toBeInTheDocument();
    expect(within(row).getByText('Ready to bill')).toBeInTheDocument();
    expect(within(row).getByText('Manual')).toBeInTheDocument();
    expect(within(row).getByText('Waiting for your ERP')).toBeInTheDocument();
  });

  it('leads each row to its invoice', () => {
    render(
      <InvoicesTable
        invoices={[invoice(), invoice({ id: 'inv-2', customerName: 'Globex' })]}
      />,
    );

    expect(screen.getByRole('link', { name: /Initech/ })).toHaveAttribute(
      'href',
      '/billing/invoices/inv-1',
    );
    expect(screen.getByRole('link', { name: /Globex/ })).toHaveAttribute(
      'href',
      '/billing/invoices/inv-2',
    );
  });

  it('says an invoice that was not issued has no due date', () => {
    render(<InvoicesTable invoices={[invoice({ status: 'DRAFT' })]} />);

    expect(screen.getByText('Not issued')).toBeInTheDocument();
  });

  it('shows a held draft as held, and one past its due date as overdue', () => {
    render(
      <InvoicesTable
        invoices={[
          invoice({
            holdReason: 'LEDGER_SEQUENCE_GAP',
            id: 'inv-held',
            status: 'DRAFT',
          }),
          invoice({
            dueAt: '2020-01-01T00:00:00.000Z',
            id: 'inv-late',
            issuedAt: '2019-12-01T00:00:00.000Z',
          }),
        ]}
      />,
    );

    expect(screen.getByText('Held')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('leaves out the columns a screen already says', () => {
    render(
      <InvoicesTable
        hiddenColumns={['invoice', 'provider', 'handoff']}
        invoices={[invoice()]}
      />,
    );

    // A header that sorts is named by its button, so the text is what says which.
    const headers = screen
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).not.toContain('Customer');
    expect(headers).not.toContain('Provider');
    expect(headers).not.toContain('Handoff');
    expect(headers).toContain('Invoice');
    // The row still leads to its invoice, from the column that is left.
    expect(screen.getByRole('link', { name: /Renewal/ })).toHaveAttribute(
      'href',
      '/billing/invoices/inv-1',
    );
  });

  it('opens ordered by the boundary each invoice bills, newest first, and says so on that header', () => {
    render(
      <InvoicesTable
        invoices={[
          invoice({ boundaryAt: '2027-01-01T00:00:00.000Z', id: 'inv-jan' }),
          invoice({ boundaryAt: '2027-03-01T00:00:00.000Z', id: 'inv-mar' }),
          invoice({ boundaryAt: '2027-02-01T00:00:00.000Z', id: 'inv-feb' }),
        ]}
      />,
    );

    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('link')[0].getAttribute('href')),
    ).toEqual([
      '/billing/invoices/inv-mar',
      '/billing/invoices/inv-feb',
      '/billing/invoices/inv-jan',
    ]);
    expect(
      screen.getByRole('columnheader', { name: /Invoice/ }),
    ).toHaveAttribute('aria-sort', 'descending');
  });

  it('sorts by who an invoice is for, the service period, the total and the due date, and leaves the status, the provider and the handoff to the filters', () => {
    render(<InvoicesTable invoices={[invoice()]} />);

    const sorted = screen
      .getAllByRole('columnheader')
      .filter((header) => header.hasAttribute('aria-sort'))
      .map((header) => header.textContent);

    expect(sorted).toEqual(['Customer', 'Invoice', 'Service period', 'Total', 'Due']);
  });

  it('sorts the totals by amount, and the invoices that were not issued after the ones that were', async () => {
    render(
      <InvoicesTable
        invoices={[
          invoice({ id: 'inv-big', total: 250000 }),
          invoice({ id: 'inv-small', total: 900 }),
          invoice({ dueAt: undefined, id: 'inv-draft', status: 'DRAFT', total: 12000 }),
        ]}
      />,
    );
    const ids = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('link')[0].getAttribute('href'));

    // An amount sorts largest first, and smallest first when asked again.
    await userEvent.click(
      screen.getByRole('button', { name: 'Not sorted, click to sort: Total' }),
    );
    expect(ids()).toEqual([
      '/billing/invoices/inv-big',
      '/billing/invoices/inv-draft',
      '/billing/invoices/inv-small',
    ]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Sorted descending: Total' }),
    );
    expect(ids()).toEqual([
      '/billing/invoices/inv-small',
      '/billing/invoices/inv-draft',
      '/billing/invoices/inv-big',
    ]);

    // The invoice that was not issued has no due date, and goes last whichever way
    // the dates go.
    await userEvent.click(
      screen.getByRole('button', { name: 'Not sorted, click to sort: Due' }),
    );
    expect(ids().at(-1)).toBe('/billing/invoices/inv-draft');
    await userEvent.click(
      screen.getByRole('button', { name: 'Sorted descending: Due' }),
    );
    expect(ids().at(-1)).toBe('/billing/invoices/inv-draft');
  });

  it('sorts the totals of one currency by amount, and never puts an amount among those of another currency', async () => {
    render(
      <InvoicesTable
        invoices={[
          invoice({ currency: 'USD', id: 'inv-usd-big', total: 250000 }),
          invoice({ currency: 'JPY', id: 'inv-jpy', total: 5000 }),
          invoice({ currency: 'USD', id: 'inv-usd-small', total: 900 }),
          invoice({ currency: 'EUR', id: 'inv-eur', total: 12000 }),
        ]}
      />,
    );
    const ids = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('link')[0].getAttribute('href'));

    // The currencies are in order, and the amounts only within one: 5,000 of JPY is
    // not 5,000 of EUR cents, so the yen is not placed among the dollars by its number.
    await userEvent.click(
      screen.getByRole('button', { name: 'Not sorted, click to sort: Total' }),
    );
    expect(ids()).toEqual([
      '/billing/invoices/inv-usd-big',
      '/billing/invoices/inv-usd-small',
      '/billing/invoices/inv-jpy',
      '/billing/invoices/inv-eur',
    ]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Sorted descending: Total' }),
    );
    expect(ids()).toEqual([
      '/billing/invoices/inv-eur',
      '/billing/invoices/inv-jpy',
      '/billing/invoices/inv-usd-small',
      '/billing/invoices/inv-usd-big',
    ]);
  });

  it('pages the rows in the browser, ten to a page', async () => {
    render(
      <InvoicesTable
        invoices={Array.from({ length: 23 }, (_, index) =>
          invoice({ id: `inv-${index + 1}` }),
        )}
      />,
    );

    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.getByText('Showing 1-10 of 23 records')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getByText('Showing 21-23 of 23 records')).toBeInTheDocument();
  });

  it('says why there is nothing to show, in the words of its screen', () => {
    render(<InvoicesTable emptyMessage="No invoice for this instance" invoices={[]} />);

    expect(screen.getByText('No invoice for this instance')).toBeInTheDocument();
  });

  it('reads in French', async () => {
    await testI18n.changeLanguage('fr');
    try {
      render(<InvoicesTable invoices={[invoice()]} />);

      expect(screen.getByText('Renouvellement')).toBeInTheDocument();
      expect(screen.getByText('Prêt à facturer')).toBeInTheDocument();
      expect(screen.getByText('En attente de votre ERP')).toBeInTheDocument();
      expect(screen.getByText('Manuel')).toBeInTheDocument();
    } finally {
      await testI18n.changeLanguage('en');
    }
  });
});

describe('the columns of the table of invoices', () => {
  const HIDDEN = ['provider'] as const;

  it('are built once for the same columns left out, however often the table renders', () => {
    const { rerender, result } = renderHook(
      ({ hidden }) => useInvoiceColumns(hidden),
      { initialProps: { hidden: HIDDEN as readonly 'provider'[] } },
    );
    const first = result.current;

    rerender({ hidden: HIDDEN });

    expect(result.current).toBe(first);
  });

  it('are built again when the columns left out change', () => {
    const { rerender, result } = renderHook(
      ({ hidden }) => useInvoiceColumns(hidden),
      { initialProps: { hidden: [] as readonly 'provider'[] } },
    );
    const withProvider = result.current.map((column) => column.id);

    rerender({ hidden: HIDDEN });

    expect(withProvider).toContain('provider');
    expect(result.current.map((column) => column.id)).not.toContain('provider');
  });

  it('leave out every column a screen says it already has', () => {
    const { result } = renderHook(() =>
      useInvoiceColumns(['invoice', 'kind', 'provider']),
    );

    expect(result.current.map((column) => column.id)).toEqual([
      'period',
      'total',
      'status',
      'due',
      'handoff',
    ]);
  });
});
