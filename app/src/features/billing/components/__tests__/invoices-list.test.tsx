import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { InvoiceSummary } from '@/api-client';
import { handleExportInvoices } from '@/api-client/msw.gen';
import {
  invoiceRow,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { InvoicesList } from '../invoices/invoices-list';

const downloadBlob = vi.hoisted(() => vi.fn());

// The browser is the edge of an export: what it was handed is the file.
vi.mock('@/lib/download-blob', () => ({ downloadBlob }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);

useBillingTexts();

// The popovers of the Filter menu ask the DOM for what jsdom does not have.
for (const method of [
  'hasPointerCapture',
  'releasePointerCapture',
  'scrollIntoView',
  'setPointerCapture',
] as const) {
  Object.defineProperty(HTMLElement.prototype, method, {
    configurable: true,
    value: () => false,
  });
}

beforeEach(() => {
  downloadBlob.mockReset();
  // The real function makes the request it is given and saves what comes back.
  downloadBlob.mockImplementation(
    async (request: () => Promise<unknown>, filename: string) => {
      await request();

      return filename;
    },
  );
});

const PAST = '2020-01-01T00:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';

/** Four invoices a month apart, of three customers, in every state the filters tell apart. */
const INVOICES: InvoiceSummary[] = [
  invoiceRow('inv-jan', 'Initech', {
    boundaryAt: '2027-01-01T00:00:00.000Z',
    dueAt: PAST,
    issuedAt: '2027-01-01T08:30:00.000Z',
    kind: 'ACTIVATION',
    paidAt: '2027-01-10T00:00:00.000Z',
    status: 'PAID',
  }),
  invoiceRow('inv-feb', 'Globex', {
    boundaryAt: '2027-02-01T00:00:00.000Z',
    dueAt: PAST,
    issuedAt: '2027-02-01T08:30:00.000Z',
    status: 'MANUAL',
  }),
  invoiceRow('inv-mar', 'Initech', {
    boundaryAt: '2027-03-01T00:00:00.000Z',
    dueAt: FUTURE,
    issuedAt: '2027-03-01T08:30:00.000Z',
    status: 'MANUAL',
  }),
  invoiceRow('inv-apr', 'Hooli', {
    boundaryAt: '2027-04-01T00:00:00.000Z',
    holdReason: 'LEDGER_SEQUENCE_GAP',
    status: 'DRAFT',
  }),
];

type Props = Partial<Parameters<typeof InvoicesList>[0]>;

function renderList(props: Props = {}) {
  const onScopeChange = vi.fn();
  renderWithClient(
    <InvoicesList
      canExport
      invoices={INVOICES}
      onScopeChange={onScopeChange}
      scope={{}}
      showProvider={false}
      {...props}
    />,
  );

  return { onScopeChange };
}

/** The ids of the invoices the rows lead to, in the order of the rows. */
const rowIds = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('link')[0]
        .getAttribute('href')
        ?.replace('/invoices/', ''),
    );

const searchBox = () => screen.getByPlaceholderText('Customer, instance or invoice');

describe('the list of invoices opened by a link', () => {
  it('opens narrowed to the held invoices, with the filter shown as a chip', () => {
    renderList({ initialFilterValues: { held: 'true' } });

    expect(rowIds()).toEqual(['inv-apr']);
    expect(document.querySelectorAll('[data-slot="filter-chip"]')).toHaveLength(1);
    expect(screen.getByText('Held')).toBeInTheDocument();
  });

  it('opens narrowed to the overdue invoices', () => {
    renderList({ initialFilterValues: { overdue: 'true' } });

    expect(rowIds()).toEqual(['inv-feb']);
  });

  it('opens narrowed to a status', () => {
    renderList({ initialFilterValues: { status: 'PAID' } });

    expect(rowIds()).toEqual(['inv-jan']);
  });

  it('opens narrowed to what waits for the accounting system', () => {
    renderList({
      initialFilterValues: { handoff: 'PENDING' },
      invoices: [
        ...INVOICES,
        invoiceRow('inv-waiting', 'Umbrella', { handoffStatus: 'PENDING' }),
      ],
    });

    expect(rowIds()).toEqual(['inv-waiting']);
  });

  it('shows every invoice again once the filters are cleared, since the link only says where they start', async () => {
    renderList({ initialFilterValues: { held: 'true' } });
    expect(rowIds()).toEqual(['inv-apr']);

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(rowIds()).toEqual(['inv-apr', 'inv-mar', 'inv-feb', 'inv-jan']);
  });
});

describe('the list of invoices', () => {
  it('lists the invoices it is given, the boundary each bills newest first, under a search and a Filter button', () => {
    renderList();

    expect(rowIds()).toEqual(['inv-apr', 'inv-mar', 'inv-feb', 'inv-jan']);
    expect(searchBox()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });

  it('has the page actions on the toolbar row, where the other lists put theirs, and not on the header', () => {
    renderList();

    expect(
      within(screen.getByRole('button', { name: 'Filter' }).closest('div[class*="md:flex-row"]') as HTMLElement).getByRole(
        'button',
        { name: 'Export' },
      ),
    ).toBeInTheDocument();
  });

  it('says no count of the invoices and has no "Load more": the console holds them all', () => {
    renderList();

    expect(screen.queryByText(/invoices? shown/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('sorts by the header the person picks', async () => {
    renderList();

    await userEvent.click(
      screen.getByRole('button', { name: 'Not sorted, click to sort: Customer' }),
    );

    expect(rowIds()).toEqual(['inv-feb', 'inv-apr', 'inv-jan', 'inv-mar']);
  });

  it('pages them in the browser, ten to a page', async () => {
    renderList({
      invoices: Array.from({ length: 12 }, (_, index) =>
        invoiceRow(`inv-${index + 1}`, 'Initech', {
          boundaryAt: new Date(Date.UTC(2027, 0, index + 1)).toISOString(),
        }),
      ),
    });

    expect(rowIds()).toHaveLength(10);
    expect(screen.getByText('Showing 1-10 of 12 records')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(rowIds()).toEqual(['inv-2', 'inv-1']);
  });

  it('shows the provider column only where Stripe collects, and the filter with it', async () => {
    const { unmount } = renderWith({ showProvider: false });
    expect(screen.queryByRole('columnheader', { name: 'Provider' })).toBeNull();
    await openFilterMenu();
    expect(screen.queryByRole('option', { name: 'Provider' })).toBeNull();
    unmount();

    renderList({ showProvider: true });
    expect(
      screen.getByRole('columnheader', { name: 'Provider' }),
    ).toBeInTheDocument();
    await openFilterMenu();
    expect(screen.getByRole('option', { name: 'Provider' })).toBeInTheDocument();
  });
});

function renderWith(props: Props) {
  const view = renderWithClient(
    <InvoicesList
      canExport
      invoices={INVOICES}
      onScopeChange={() => {}}
      scope={{}}
      showProvider={false}
      {...props}
    />,
  );

  return view;
}

async function openFilterMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
  await screen.findByRole('option', { name: 'Status' });
}

describe('the search of the list', () => {
  it.each([
    ['the name of a customer, in any case', 'GLOBEX', ['inv-feb']],
    ['the slug of an instance', 'hooli-production', ['inv-apr']],
    ['the identifier of an invoice', 'inv-mar', ['inv-mar']],
  ])('matches %s', async (_, typed, expected) => {
    renderList();

    await userEvent.type(searchBox(), typed);

    await waitFor(() => expect(rowIds()).toEqual(expected));
  });

  it('shows a message that clears it when nothing matches', async () => {
    renderList();

    await userEvent.type(searchBox(), 'nobody');

    expect(await screen.findByTestId('invoices-empty')).toHaveTextContent(
      'No invoice matches these filters',
    );
    await userEvent.click(
      within(screen.getByTestId('invoices-empty')).getByRole('button', {
        name: 'Clear filters',
      }),
    );

    await waitFor(() => expect(rowIds()).toHaveLength(4));
    expect(searchBox()).toHaveValue('');
  });
});

describe('the filters of the list', () => {
  it('filter the rows in the browser, and say each one in a chip', async () => {
    renderList();

    await openFilterMenu();
    await userEvent.click(screen.getByRole('option', { name: 'Held' }));
    await userEvent.click(await screen.findByRole('option', { name: 'True' }));

    await waitFor(() => expect(rowIds()).toEqual(['inv-apr']));
    expect(screen.getByText('Held: True')).toBeInTheDocument();
  });

  it('pick the statuses together from the list the menu opens on', async () => {
    renderList();

    await openFilterMenu();
    await userEvent.click(screen.getByRole('option', { name: 'Status' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Paid' }));
    await userEvent.click(screen.getByRole('option', { name: 'Ready to bill' }));

    await waitFor(() =>
      expect(rowIds()).toEqual(['inv-mar', 'inv-feb', 'inv-jan']),
    );
  });

  it('select the invoices past their due date as the badge says them', async () => {
    renderList();

    await openFilterMenu();
    await userEvent.click(screen.getByRole('option', { name: 'Overdue' }));
    await userEvent.click(await screen.findByRole('option', { name: 'True' }));

    await waitFor(() => expect(rowIds()).toEqual(['inv-feb']));
  });
});

describe('the scope of the list', () => {
  it('is a chip that names the customer, and takes it off to the bare path', async () => {
    const { onScopeChange } = renderList({ scope: { customerSlug: 'initech' } });

    expect(screen.getByText('Customer: initech')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Remove the filter Customer: initech',
      }),
    );

    expect(onScopeChange).toHaveBeenCalledWith({ customerSlug: undefined });
  });

  it('is a chip for the instance as well, and each leaves the other where it was', async () => {
    const { onScopeChange } = renderList({
      scope: { customerSlug: 'initech', instanceSlug: 'initech-production' },
    });

    expect(screen.getByText('Customer: initech')).toBeInTheDocument();
    expect(screen.getByText('Instance: initech-production')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Remove the filter Instance: initech-production',
      }),
    );

    expect(onScopeChange).toHaveBeenCalledWith({
      customerSlug: 'initech',
      instanceSlug: undefined,
    });
  });

  it('is no chip when there is none', () => {
    renderList();

    expect(screen.queryByRole('button', { name: /Remove the filter/ })).toBeNull();
  });
});

describe('the empty list', () => {
  it('says there is nothing yet, and where an invoice comes from', () => {
    renderList({ invoices: [] });

    expect(screen.getByTestId('invoices-empty')).toHaveTextContent(
      'No invoices yet',
    );
    expect(
      screen.getByRole('link', { name: 'Go to instances' }),
    ).toHaveAttribute('href', '/customers/instances');
  });

  it('says whose it is when a customer was never invoiced, and leads to every invoice', async () => {
    const { onScopeChange } = renderList({
      invoices: [],
      scope: { customerSlug: 'nobody' },
    });

    expect(screen.getByTestId('invoices-empty')).toHaveTextContent(
      'No invoice for this customer',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Show every invoice' }),
    );

    expect(onScopeChange).toHaveBeenCalledWith({});
  });

  it('says it is the instance that was never invoiced when the scope is one', () => {
    renderList({ invoices: [], scope: { instanceSlug: 'nobody-prod' } });

    expect(screen.getByTestId('invoices-empty')).toHaveTextContent(
      'No invoice for this instance',
    );
  });
});

describe('the export of the list', () => {
  /** Answers the export, and records the query the API was asked with. */
  function serveExport() {
    const asked: URLSearchParams[] = [];
    server.use(
      handleExportInvoices(({ request }) => {
        asked.push(new URL(request.url).searchParams);

        return new HttpResponse('csv');
      }),
    );

    return asked;
  }

  const openExport = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
  };

  it('is offered where the session may export, and not otherwise', () => {
    const { unmount } = renderWith({ canExport: true });
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    unmount();

    renderList({ canExport: false });
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
  });

  it('asks for the scope of the page, and for nothing else when no filter is set', async () => {
    const asked = serveExport();
    renderList({ scope: { customerSlug: 'initech' } });

    await openExport();
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'CSV by invoice' }),
    );

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0].get('customerSlug')).toBe('initech');
    expect([...asked[0].keys()].sort()).toEqual([
      'customerSlug',
      'format',
      'granularity',
    ]);
    expect(screen.queryByTestId('export-unapplied')).toBeNull();
  });

  it('says the search is not applied to the file when it holds text, and sends the filters the API has', async () => {
    const asked = serveExport();
    renderList({ scope: { instanceSlug: 'initech-production' } });
    await openFilterMenu();
    await userEvent.click(screen.getByRole('option', { name: 'Kind' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Renewal' }));
    await userEvent.type(searchBox(), 'globex');

    await openExport();

    expect(await screen.findByTestId('export-unapplied')).toHaveTextContent(
      'This filter is not applied to the file: Search.',
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'CSV by invoice line' }),
    );

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0].get('instanceSlug')).toBe('initech-production');
    expect(asked[0].get('kind')).toBe('RENEWAL');
    // Nothing of the text typed in the search reaches the API.
    expect(asked[0].toString()).not.toContain('globex');
  });

  it('says overdue is not applied to the file, since the API counts it more widely than the screen', async () => {
    const asked = serveExport();
    renderList();
    await openFilterMenu();
    await userEvent.click(screen.getByRole('option', { name: 'Overdue' }));
    await userEvent.click(await screen.findByRole('option', { name: 'True' }));
    await waitFor(() => expect(rowIds()).toEqual(['inv-feb']));

    await openExport();

    expect(await screen.findByTestId('export-unapplied')).toHaveTextContent(
      'This filter is not applied to the file: Overdue.',
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'CSV by invoice' }),
    );

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0].has('overdue')).toBe(false);
  });
});
