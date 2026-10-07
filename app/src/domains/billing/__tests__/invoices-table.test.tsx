import { render, renderHook, screen, within } from '@testing-library/react';
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

    expect(
      screen.queryByRole('columnheader', { name: 'Customer' }),
    ).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Provider' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Handoff' })).toBeNull();
    expect(
      screen.getByRole('columnheader', { name: 'Invoice' }),
    ).toBeInTheDocument();
    // The row still leads to its invoice, from the column that is left.
    expect(screen.getByRole('link', { name: /Renewal/ })).toHaveAttribute(
      'href',
      '/billing/invoices/inv-1',
    );
  });

  it('sorts nothing: the server orders a list it pages', () => {
    render(<InvoicesTable invoices={[invoice()]} />);

    for (const header of screen.getAllByRole('columnheader')) {
      expect(header).not.toHaveAttribute('aria-sort');
    }
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
