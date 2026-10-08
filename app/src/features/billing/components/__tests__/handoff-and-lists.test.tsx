import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { QueuedInvoice } from '@/api-client';
import { HandoffEmpty } from '../handoff/handoff-empty';
import { HandoffTable } from '../handoff/handoff-table';
import {
  queuedRow,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';

vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(vi.fn()),
);

useBillingTexts();

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

  const customers = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0].textContent);

  it('opens oldest issue first, whatever order the rows come in', () => {
    render(
      <HandoffTable
        invoices={[
          queued({
            customerName: 'Newest',
            id: 'inv-2',
            issuedAt: '2027-03-09T00:00:00.000Z',
          }),
          queued({
            customerName: 'Oldest',
            id: 'inv-1',
            issuedAt: '2027-03-01T00:00:00.000Z',
          }),
          queued({
            customerName: 'Middle',
            id: 'inv-3',
            issuedAt: '2027-03-05T00:00:00.000Z',
          }),
        ]}
        status="PENDING"
      />,
    );

    expect(customers()).toEqual([
      expect.stringContaining('Oldest'),
      expect.stringContaining('Middle'),
      expect.stringContaining('Newest'),
    ]);
  });

  it('sorts by the header a person presses, and by the claims of a consumer', async () => {
    render(
      <HandoffTable
        invoices={[
          queued({
            customerName: 'Once',
            handoff: { claimCount: 1, status: 'PENDING' },
            id: 'inv-1',
          }),
          queued({
            customerName: 'Thrice',
            handoff: { claimCount: 3, status: 'PENDING' },
            id: 'inv-2',
          }),
          queued({
            customerName: 'Never',
            handoff: { claimCount: 0, status: 'PENDING' },
            id: 'inv-3',
          }),
        ]}
        status="PENDING"
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Not sorted, click to sort: Claims' }),
    );

    // A number sorts the biggest first on its first press.
    expect(customers()).toEqual([
      expect.stringContaining('Thrice'),
      expect.stringContaining('Once'),
      expect.stringContaining('Never'),
    ]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Sorted descending: Claims' }),
    );

    expect(customers()).toEqual([
      expect.stringContaining('Never'),
      expect.stringContaining('Once'),
      expect.stringContaining('Thrice'),
    ]);
  });

  it('sorts the totals of one currency by amount, and never puts an amount among those of another currency', async () => {
    render(
      <HandoffTable
        invoices={[
          queued({ currency: 'USD', customerName: 'Dollars', id: 'inv-1', total: 250000 }),
          queued({ currency: 'JPY', customerName: 'Yen', id: 'inv-2', total: 5000 }),
          queued({ currency: 'USD', customerName: 'Cents', id: 'inv-3', total: 900 }),
        ]}
        status="PENDING"
      />,
    );

    // The yen are not placed among the dollars by their number, which is not cents:
    // the currencies are in order, the dollars first on a first press, and the
    // amounts only within one.
    await userEvent.click(
      screen.getByRole('button', { name: 'Not sorted, click to sort: Total' }),
    );
    expect(customers()).toEqual([
      expect.stringContaining('Dollars'),
      expect.stringContaining('Cents'),
      expect.stringContaining('Yen'),
    ]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Sorted descending: Total' }),
    );
    expect(customers()).toEqual([
      expect.stringContaining('Yen'),
      expect.stringContaining('Cents'),
      expect.stringContaining('Dollars'),
    ]);
  });

  it('pages the queue in the browser, ten to a page', async () => {
    render(
      <HandoffTable
        invoices={Array.from({ length: 12 }, (_, index) =>
          queued({
            customerName: `Customer ${index + 1}`,
            id: `inv-${index + 1}`,
            issuedAt: new Date(Date.UTC(2027, 2, index + 1)).toISOString(),
          }),
        )}
        status="PENDING"
      />,
    );

    expect(screen.getAllByRole('row').slice(1)).toHaveLength(10);
    expect(screen.getByText('Showing 1-10 of 12 records')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(customers()).toEqual([
      expect.stringContaining('Customer 11'),
      expect.stringContaining('Customer 12'),
    ]);
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
    // The header of the column of claims sorts them: it is not a way to claim.
    expect(screen.queryByRole('button', { name: /^(?!.*sort).*claim/i })).toBeNull();
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
    render(
      <HandoffEmpty filtered={false} onClearFilters={vi.fn()} status="PENDING" />,
    );

    expect(screen.getByTestId('handoff-empty')).toHaveTextContent(
      'Nothing is waiting for your ERP',
    );
    expect(screen.getByText('kaiten billing handoff claim')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says nothing was acknowledged yet, with no command to run', () => {
    render(
      <HandoffEmpty
        filtered={false}
        onClearFilters={vi.fn()}
        status="ACKNOWLEDGED"
      />,
    );

    expect(screen.getByTestId('handoff-empty')).toHaveTextContent(
      'Nothing acknowledged yet',
    );
    expect(screen.queryByText('kaiten billing handoff claim')).toBeNull();
  });

  it('says no invoice matches when a filter is why, and clears the filters from the message', async () => {
    const onClearFilters = vi.fn();
    render(
      <HandoffEmpty filtered onClearFilters={onClearFilters} status="PENDING" />,
    );

    expect(screen.getByTestId('handoff-empty')).toHaveTextContent(
      'No invoice matches these filters',
    );
    // The queue is not empty: the command that takes what waits has no place here.
    expect(screen.queryByText('kaiten billing handoff claim')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onClearFilters).toHaveBeenCalledOnce();
  });
});
