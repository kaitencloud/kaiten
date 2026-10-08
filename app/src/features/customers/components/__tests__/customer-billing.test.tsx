import { screen, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Customer, PageInvoiceSummary } from '@/api-client';
import { handleListInvoices } from '@/api-client/msw.gen';
import {
  invoiceRow,
  pageOf,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { CustomerDetailsCard } from '../customer-detail/customer-details-card';
import { CustomerInvoicesCard } from '../customer-detail/customer-invoices-card';

vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);

let billing = { isBillingEnabled: true, mayReadInvoices: true };
vi.mock('../../hooks/use-customer-billing', () => ({
  useCustomerBilling: () => billing,
}));

useBillingTexts();

beforeEach(() => {
  billing = { isBillingEnabled: true, mayReadInvoices: true };
});

// The audit members are the API's to write and the card shows none of them here.
const customer = (overrides: Partial<Customer> = {}) =>
  ({
    createdAt: '2027-01-01T00:00:00.000Z',
    id: 'customer-1',
    name: 'Acme Corp',
    slug: 'acme',
    updatedAt: '2027-01-02T00:00:00.000Z',
    ...overrides,
  }) as Customer;

describe('the billing e-mail on the details of a customer', () => {
  it('shows the address where billing is on', () => {
    render(
      <CustomerDetailsCard customer={customer({ billingEmail: 'ap@acme.com' })} />,
    );

    expect(screen.getByText('Billing e-mail')).toBeInTheDocument();
    expect(screen.getByText('ap@acme.com')).toBeInTheDocument();
  });

  it('says there is none, in muted words, when the customer has none', () => {
    render(<CustomerDetailsCard customer={customer()} />);

    expect(screen.getByText('Not set')).toHaveClass('text-muted-foreground');
  });

  it('is absent, not empty, where billing is off', () => {
    billing = { isBillingEnabled: false, mayReadInvoices: false };
    render(
      <CustomerDetailsCard customer={customer({ billingEmail: 'ap@acme.com' })} />,
    );

    expect(screen.queryByText('Billing e-mail')).toBeNull();
    expect(screen.queryByText('ap@acme.com')).toBeNull();
  });
});

describe('the invoices of a customer', () => {
  function serve(...pages: PageInvoiceSummary[]) {
    const asked: URLSearchParams[] = [];
    server.use(
      handleListInvoices(({ request }) => {
        asked.push(new URL(request.url).searchParams);

        return HttpResponse.json(
          pages[Math.min(asked.length, pages.length) - 1],
        );
      }),
    );

    return asked;
  }

  it('asks the API for this customer only, a page of fifty at a time', async () => {
    const asked = serve(pageOf([invoiceRow('inv-1', 'Acme')]));
    renderWithClient(<CustomerInvoicesCard customerSlug="acme" />);

    expect(await screen.findByText('Acme')).toBeInTheDocument();

    expect(asked).toHaveLength(1);
    expect(asked[0].get('customerSlug')).toBe('acme');
    expect(asked[0].get('limit')).toBe('50');
    expect(asked[0].has('cursor')).toBe(false);
  });

  it('keeps the column that says which instance an invoice is for', async () => {
    serve(pageOf([invoiceRow('inv-1', 'Acme')]));
    renderWithClient(<CustomerInvoicesCard customerSlug="acme" />);

    await screen.findByText('Acme');

    expect(screen.getByText('acme-production')).toBeInTheDocument();
  });

  it('reads the next page with the same customer when asked', async () => {
    const asked = serve(
      pageOf([invoiceRow('inv-1', 'Acme')], 'cursor-2'),
      pageOf([invoiceRow('inv-2', 'Acme', { instanceSlug: 'acme-staging' })]),
    );
    renderWithClient(<CustomerInvoicesCard customerSlug="acme" />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Load more' }),
    );

    expect(await screen.findByText('acme-staging')).toBeInTheDocument();
    expect(asked[1].get('cursor')).toBe('cursor-2');
    expect(asked[1].get('customerSlug')).toBe('acme');
  });

  it('says that none of its instances has been invoiced yet', async () => {
    serve(pageOf([]));
    renderWithClient(<CustomerInvoicesCard customerSlug="acme" />);

    expect(await screen.findByTestId('customer-invoices-empty')).toHaveTextContent(
      'None of the instances of this customer has been invoiced yet.',
    );
  });
});
