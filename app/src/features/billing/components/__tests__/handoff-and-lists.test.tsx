import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { QueuedInvoice } from '@/api-client';
import { handleExportInvoices } from '@/api-client/msw.gen';
import { ExportInvoicesMenu } from '@/domains/billing';
import { InvoiceFiltersToolbar } from '../invoices/invoice-filters-toolbar';
import { HandoffEmpty } from '../handoff/handoff-empty';
import { HandoffTable } from '../handoff/handoff-table';
import {
  queuedRow,
  refusal,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';

const downloadBlob = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

// The browser is the edge of an export: what it was handed is the file.
vi.mock('@/lib/download-blob', () => ({ downloadBlob }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(vi.fn()),
);

useBillingTexts();

beforeEach(() => {
  downloadBlob.mockReset();
  // The real function makes the request it is given and saves what comes back.
  downloadBlob.mockImplementation(
    async (request: () => Promise<unknown>, filename: string) => {
      await request();

      return filename;
    },
  );
  toast.error.mockReset();
});

const queued = (overrides: Partial<QueuedInvoice> = {}): QueuedInvoice =>
  queuedRow('inv-1', 'Initech', overrides);

describe('the invoices of the handoff queue', () => {
  it('shows what waits: who it is for, what it bills, when it was issued and how many times it was taken', () => {
    render(
      <HandoffTable
        invoices={[
          queued({ handoff: { claimCount: 3, status: 'PENDING' } }),
          queued({ handoff: { claimCount: 1, status: 'PENDING' }, id: 'inv-2' }),
        ]}
        status="PENDING"
      />,
    );

    const [first, second] = screen.getAllByRole('row').slice(1);
    expect(within(first).getByText('Initech')).toBeInTheDocument();
    expect(within(first).getByText('$129.00')).toBeInTheDocument();
    // When it was issued: the day, and under it the time.
    expect(within(first).getByText('Mar 2, 2027 (UTC)')).toBeInTheDocument();
    expect(within(first).getByText('12:00 AM (UTC)')).toBeInTheDocument();
    expect(within(first).getByText('3 claims')).toBeInTheDocument();
    expect(within(second).getByText('1 claim')).toBeInTheDocument();
  });

  it('keeps the order the API gives, oldest first, and sorts nothing', () => {
    render(
      <HandoffTable
        invoices={[
          queued({ customerName: 'Oldest', id: 'inv-1' }),
          queued({ customerName: 'Newest', id: 'inv-2' }),
        ]}
        status="PENDING"
      />,
    );

    expect(
      screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent),
    ).toEqual([
      expect.stringContaining('Oldest'),
      expect.stringContaining('Newest'),
    ]);
    for (const header of screen.getAllByRole('columnheader')) {
      expect(header).not.toHaveAttribute('aria-sort');
    }
  });

  it('shows the status of each invoice, since a void or written-off one still waits in the queue', () => {
    render(
      <HandoffTable
        invoices={[
          queued(),
          queued({ id: 'inv-2', status: 'VOID' }),
          queued({ id: 'inv-3', status: 'UNCOLLECTIBLE' }),
        ]}
        status="PENDING"
      />,
    );

    expect(
      screen.getByRole('columnheader', { name: 'Status' }),
    ).toBeInTheDocument();
    const [manual, voided, writtenOff] = screen.getAllByRole('row').slice(1);
    expect(within(manual).getByText('Ready to bill')).toBeInTheDocument();
    expect(within(voided).getByText('Void')).toBeInTheDocument();
    expect(within(writtenOff).getByText('Written off')).toBeInTheDocument();
  });

  it('says until when a consumer holds an invoice, while its lease has not run out', () => {
    render(
      <HandoffTable
        invoices={[
          queued({
            handoff: {
              claimCount: 1,
              leaseId: 'lease-1',
              leasedUntil: '2099-01-01T00:00:00.000Z',
              status: 'PENDING',
            },
          }),
          queued({
            handoff: {
              claimCount: 1,
              leasedUntil: '2020-01-01T00:00:00.000Z',
              status: 'PENDING',
            },
            id: 'inv-2',
          }),
        ]}
        status="PENDING"
      />,
    );

    const [held, expired] = screen.getAllByRole('row').slice(1);
    expect(within(held).getByText('Reserved until Jan 1, 2099, 12:00 AM (UTC)')).toBeInTheDocument();
    expect(within(expired).queryByText(/Reserved until/)).toBeNull();
  });

  it('leads each row to its invoice', () => {
    render(<HandoffTable invoices={[queued()]} status="PENDING" />);

    expect(screen.getByRole('link', { name: /Initech/ })).toHaveAttribute(
      'href',
      '/billing/invoices/inv-1',
    );
  });

  it('offers to acknowledge an invoice that waits, to a session that may, and never a claim', async () => {
    const onAcknowledge = vi.fn();
    render(
      <HandoffTable
        invoices={[queued()]}
        onAcknowledge={onAcknowledge}
        status="PENDING"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));

    expect(onAcknowledge).toHaveBeenCalledWith(queued());
    expect(screen.queryByRole('button', { name: /claim/i })).toBeNull();
  });

  it('offers nothing to a session that may not acknowledge', () => {
    render(<HandoffTable invoices={[queued()]} status="PENDING" />);

    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });

  it('shows the number an acknowledged invoice was booked under, and when', () => {
    render(
      <HandoffTable
        invoices={[
          queued({
            handoff: {
              acknowledgedAt: '2027-03-05T09:00:00.000Z',
              claimCount: 1,
              externalReference: 'ERP-1042',
              status: 'ACKNOWLEDGED',
            },
            handoffStatus: 'ACKNOWLEDGED',
          }),
          queued({
            handoff: {
              acknowledgedAt: '2027-03-05T10:00:00.000Z',
              claimCount: 0,
              status: 'ACKNOWLEDGED',
            },
            handoffStatus: 'ACKNOWLEDGED',
            id: 'inv-2',
          }),
        ]}
        onAcknowledge={() => {}}
        status="ACKNOWLEDGED"
      />,
    );

    const [booked, bare] = screen.getAllByRole('row').slice(1);
    expect(within(booked).getByText('ERP-1042')).toBeInTheDocument();
    expect(within(booked).getByText('Mar 5, 2027, 9:00 AM (UTC)')).toBeInTheDocument();
    expect(within(bare).getByText('No reference')).toBeInTheDocument();
    // What was booked is not acknowledged a second time.
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
  });
});

describe('an empty queue', () => {
  it('teaches the command that takes what waits, since claiming is not a button', () => {
    render(<HandoffEmpty status="PENDING" />);

    expect(screen.getByTestId('handoff-empty')).toHaveTextContent(
      'Nothing is waiting for your ERP',
    );
    expect(screen.getByText('kaiten billing handoff claim')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says nothing was acknowledged yet, with no command to run', () => {
    render(<HandoffEmpty status="ACKNOWLEDGED" />);

    expect(screen.getByTestId('handoff-empty')).toHaveTextContent(
      'Nothing acknowledged yet',
    );
    expect(screen.queryByText('kaiten billing handoff claim')).toBeNull();
  });
});

describe('exporting the invoices of the list', () => {
  const filters = { customerSlug: 'initech', status: ['MANUAL' as const] };

  /** Answers the export, and records the query the API was asked with. */
  function serveExport(answer: () => Response = () => new HttpResponse('csv')) {
    const asked: URLSearchParams[] = [];
    server.use(
      handleExportInvoices(({ request }) => {
        asked.push(new URL(request.url).searchParams);

        return answer();
      }),
    );

    return asked;
  }

  // The export is a request like another: it has the client of the page.
  const renderMenu = () =>
    renderWithClient(<ExportInvoicesMenu filters={filters} />);

  const open = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
  };

  it.each([
    ['CSV by invoice line', 'csv', 'line', /^invoices-by-line-\d{8}T\d{6}Z\.csv$/],
    ['CSV by invoice', 'csv', 'invoice', /^invoices-by-invoice-\d{8}T\d{6}Z\.csv$/],
    ['NDJSON, one invoice per line', 'json', null, /^invoices-\d{8}T\d{6}Z\.ndjson$/],
  ])(
    'offers %s, with the filters of the list and none of its paging',
    async (label, format, granularity, filename) => {
      const asked = serveExport();
      renderMenu();

      await open();
      await userEvent.click(
        await screen.findByRole('menuitem', { name: label }),
      );

      await waitFor(() => expect(asked).toHaveLength(1));
      expect(asked[0].get('format')).toBe(format);
      expect(asked[0].get('granularity')).toBe(granularity);
      expect(asked[0].get('customerSlug')).toBe('initech');
      expect(asked[0].getAll('status')).toEqual(['MANUAL']);
      // The export walks every page by itself.
      expect(asked[0].has('cursor')).toBe(false);
      expect(asked[0].has('limit')).toBe(false);
      expect(downloadBlob).toHaveBeenCalledWith(
        expect.any(Function),
        expect.stringMatching(filename),
      );
    },
  );

  it('shows the refusal of the API as it was written, and changes nothing else', async () => {
    serveExport(() => refusal(503, { detail: 'the export is not available' }));
    renderMenu();

    await open();
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'CSV by invoice' }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('the export is not available'),
    );
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled();
  });
});

describe('the filters of the list', () => {
  it('shows a chip for each filter that is set, and takes it off alone', async () => {
    const onChange = vi.fn();
    render(
      <InvoiceFiltersToolbar
        filters={{ customerSlug: 'initech', kind: 'RENEWAL' }}
        onChange={onChange}
        showProvider={false}
      />,
    );

    expect(screen.getByText('Kind: Renewal')).toBeInTheDocument();
    expect(screen.getByText('Customer: initech')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove the filter Kind: Renewal' }),
    );

    expect(onChange).toHaveBeenCalledWith({
      customerSlug: 'initech',
      kind: undefined,
    });
  });

  it('counts the filters on its button and clears them all in one click', async () => {
    const onChange = vi.fn();
    render(
      <InvoiceFiltersToolbar
        filters={{ held: true, kind: 'FINAL', status: ['PAID'] }}
        onChange={onChange}
        showProvider={false}
      />,
    );

    expect(screen.getByRole('button', { name: /Filters/ })).toHaveTextContent('3');

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onChange).toHaveBeenCalledWith({});
  });

  it('has nothing to clear when no filter is set', () => {
    render(
      <InvoiceFiltersToolbar filters={{}} onChange={() => {}} showProvider={false} />,
    );

    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('sets a status filter from the panel, as the API takes it', async () => {
    const onChange = vi.fn();
    render(
      <InvoiceFiltersToolbar filters={{}} onChange={onChange} showProvider={false} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Paid' }));

    expect(onChange).toHaveBeenCalledWith({ status: ['PAID'] });
  });

  it('applies a customer typed in the panel when Enter is pressed, not on each key', async () => {
    const onChange = vi.fn();
    render(
      <InvoiceFiltersToolbar filters={{}} onChange={onChange} showProvider={false} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));
    await userEvent.type(await screen.findByLabelText('Customer'), 'initech');
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ customerSlug: 'initech' });
  });

  it('does not apply what is typed on the Enter that confirms a composition', async () => {
    const onChange = vi.fn();
    render(
      <InvoiceFiltersToolbar filters={{}} onChange={onChange} showProvider={false} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));
    const field = await screen.findByLabelText('Customer');
    await userEvent.type(field, 'initech');

    // An input method ends its composition with an Enter that is not the person's.
    fireEvent.keyDown(field, { isComposing: true, key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ customerSlug: 'initech' });
  });

  it('offers the provider only where a payment provider exists', async () => {
    const { rerender } = render(
      <InvoiceFiltersToolbar filters={{}} onChange={() => {}} showProvider={false} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));
    await screen.findByRole('checkbox', { name: 'Paid' });
    expect(screen.queryByText('Provider')).toBeNull();

    rerender(
      <InvoiceFiltersToolbar filters={{}} onChange={() => {}} showProvider />,
    );
    expect(await screen.findByText('Provider')).toBeInTheDocument();
  });
});
