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
