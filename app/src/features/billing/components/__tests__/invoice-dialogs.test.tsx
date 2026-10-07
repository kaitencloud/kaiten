import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Invoice, QueuedInvoice } from '@/api-client';
import {
  handleAckHandoff,
  handleMarkInvoicePaid,
} from '@/api-client/msw.gen';
import { buildInvoice } from '../../../../../e2e/app/_support/fixtures/build-invoice';
import { AcknowledgeHandoffDialog } from '../handoff/acknowledge-handoff-dialog';
import { MarkPaidDialog } from '../invoice-detail/mark-paid-dialog';
import {
  queuedRow,
  refusal,
  renderWithClient,
  useBillingTexts,
} from './billing-test-support';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async () =>
  (await import('./billing-test-support')).createRouterModule(vi.fn()),
);

useBillingTexts();

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
});

// The dialog shows its confirmation before its fields: the form is there once a
// field is.
async function confirmWhenReady(field: string | RegExp, button: string) {
  await screen.findByLabelText(field);
  await userEvent.click(await screen.findByRole('button', { name: button }));
}

const bookedInvoice = (overrides: Partial<Invoice> = {}): Invoice =>
  buildInvoice({
    boundaryAt: '2027-03-01T00:00:00.000Z',
    id: 'inv-1',
    lines: [],
    ...overrides,
  });

/** Answers the acknowledgement, and records the body it was sent and for which invoice. */
function serveAcknowledgement(
  answer: () => Response = () => HttpResponse.json(bookedInvoice()),
) {
  const sent: Array<{ body: Record<string, unknown>; invoiceId: unknown }> = [];
  server.use(
    handleAckHandoff(async ({ params, request }) => {
      sent.push({
        body: (await request.json()) as Record<string, unknown>,
        invoiceId: params.invoiceId,
      });

      return answer();
    }),
  );

  return sent;
}

const queued = (overrides: Partial<QueuedInvoice> = {}) =>
  queuedRow('inv-1', 'Initech', overrides);

const renderAcknowledge = (
  invoice: QueuedInvoice = queued(),
  onClose: () => void = () => {},
) =>
  renderWithClient(
    <AcknowledgeHandoffDialog invoice={invoice} onClose={onClose} />,
  );

describe('the acknowledgement of a handoff by hand', () => {
  it('says which invoice it is about', async () => {
    renderAcknowledge();

    expect(
      await screen.findByTestId('acknowledge-handoff-invoice'),
    ).toHaveTextContent('Initech · Renewal Mar 1, 2027 (UTC) · $129.00');
  });

  it('sends the number of the accounting system trimmed, with no lease, and closes', async () => {
    const sent = serveAcknowledgement();
    const onClose = vi.fn();
    renderAcknowledge(queued(), onClose);

    await userEvent.type(
      await screen.findByLabelText('External reference'),
      '  ERP-1042 ',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Acknowledge' }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([
      { body: { externalReference: 'ERP-1042' }, invoiceId: 'inv-1' },
    ]);
    expect(sent[0].body).not.toHaveProperty('leaseId');
    expect(toast.success).toHaveBeenCalledWith('Invoice acknowledged');
  });

  it('can be confirmed with no number at all', async () => {
    const sent = serveAcknowledgement();
    renderAcknowledge();

    await confirmWhenReady('External reference', 'Acknowledge');

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toEqual({});
  });

  it('warns that a consumer holds the invoice while its lease has not run out', async () => {
    renderAcknowledge(
      queued({
        handoff: {
          claimCount: 1,
          leaseId: 'lease-1',
          leasedUntil: '2099-01-01T00:00:00.000Z',
          status: 'PENDING',
        },
      }),
    );

    expect(
      await screen.findByTestId('acknowledge-handoff-leased'),
    ).toHaveTextContent('Jan 1, 2099');
  });

  it('does not warn about a lease that ran out', async () => {
    renderAcknowledge(
      queued({
        handoff: {
          claimCount: 1,
          leasedUntil: '2020-01-01T00:00:00.000Z',
          status: 'PENDING',
        },
      }),
    );

    await screen.findByTestId('acknowledge-handoff-invoice');
    expect(screen.queryByTestId('acknowledge-handoff-leased')).toBeNull();
  });

  it('shows what the API refused with, in its own words, and stays open', async () => {
    serveAcknowledgement(() =>
      refusal(409, {
        code: 'AckHandoff.ReferenceMismatch',
        detail: 'the invoice was already acknowledged under another reference',
      }),
    );
    const onClose = vi.fn();
    renderAcknowledge(queued(), onClose);

    await userEvent.type(
      await screen.findByLabelText('External reference'),
      'ERP-2',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Acknowledge' }),
    );

    expect(
      await screen.findByText(
        'the invoice was already acknowledged under another reference',
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a number the API refuses beside the field it is typed in', async () => {
    serveAcknowledgement(() =>
      refusal(422, {
        code: 'AckHandoff.InvalidExternalReference',
        detail: 'externalReference is 1 to 255 characters',
      }),
    );
    renderAcknowledge();

    await userEvent.type(
      await screen.findByLabelText('External reference'),
      'x',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Acknowledge' }),
    );

    expect(
      await screen.findByText('externalReference is 1 to 255 characters'),
    ).toBeInTheDocument();
    // It is the field's: nothing is shown above the buttons.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/** Answers the payment, and records what the API was sent. */
function servePayment(
  answer: () => Response = () =>
    HttpResponse.json(bookedInvoice({ status: 'PAID' })),
) {
  const sent: Array<Record<string, unknown>> = [];
  server.use(
    handleMarkInvoicePaid(async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>);

      return answer();
    }),
  );

  return sent;
}

const renderPaid = (
  invoice: Invoice = bookedInvoice({
    handoff: { claimCount: 0, status: 'PENDING' },
    handoffStatus: 'PENDING',
  }),
  onClose: () => void = () => {},
) => renderWithClient(<MarkPaidDialog invoice={invoice} onClose={onClose} />);

describe('marking an invoice paid', () => {
  it('can be confirmed with nothing filled in: it is paid now', async () => {
    const sent = servePayment();
    const onClose = vi.fn();
    renderPaid(undefined, onClose);

    await confirmWhenReady('External reference', 'Mark as paid');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // Nothing that was not filled in is sent: an empty field is not a value.
    expect(sent).toEqual([{}]);
    expect(toast.success).toHaveBeenCalledWith('Invoice marked as paid');
  });

  it('sends the number, the time read as UTC and the note', async () => {
    const sent = servePayment();
    renderPaid();

    await userEvent.type(
      await screen.findByLabelText('External reference'),
      'ERP-1042',
    );
    await userEvent.type(await screen.findByLabelText('Note'), 'wire transfer');
    const paidAt = await screen.findByLabelText(/Paid at/);
    await userEvent.clear(paidAt);
    await userEvent.type(paidAt, '2020-03-03T10:00');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Mark as paid' }),
    );

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      externalReference: 'ERP-1042',
      note: 'wire transfer',
      paidAt: '2020-03-03T10:00:00.000Z',
    });
  });

  it('says it acknowledges the handoff when the invoice still waits in the queue', async () => {
    renderPaid();

    expect(
      await screen.findByText(
        /also acknowledges the invoice in the handoff queue/,
      ),
    ).toBeInTheDocument();
  });

  it('does not say so for an invoice that is not in the queue', async () => {
    renderPaid(bookedInvoice({ handoffStatus: 'NOT_REQUIRED' }));

    await screen.findByLabelText('Note');
    expect(screen.queryByText(/acknowledges the invoice/)).toBeNull();
  });

  it('shows a refusal about the time beside the time, where it is typed', async () => {
    servePayment(() =>
      refusal(422, {
        code: 'MarkInvoicePaid.PaidAtInFuture',
        detail: 'paidAt must not be in the future',
      }),
    );
    renderPaid();

    await confirmWhenReady('External reference', 'Mark as paid');

    expect(
      await screen.findByText('paidAt must not be in the future'),
    ).toBeInTheDocument();
    // Another field is not blamed for it.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('puts the error the API locates on its field', async () => {
    servePayment(() =>
      refusal(422, {
        code: 'MarkInvoicePaid.Invalid',
        detail: 'the request is not valid',
        errors: [{ location: 'body.note', message: 'note is too long' }],
      }),
    );
    renderPaid();

    await confirmWhenReady('External reference', 'Mark as paid');

    expect(await screen.findByText('note is too long')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows any other refusal above the buttons, and stays open', async () => {
    servePayment(() =>
      refusal(409, {
        code: 'MarkInvoicePaid.InvalidStatus',
        detail: 'only a MANUAL invoice can be marked paid',
      }),
    );
    const onClose = vi.fn();
    renderPaid(undefined, onClose);

    await confirmWhenReady('External reference', 'Mark as paid');

    expect(
      await screen.findByText('only a MANUAL invoice can be marked paid'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('says nothing was changed on a 503, and sends the form again when asked', async () => {
    let sent = 0;
    server.use(
      handleMarkInvoicePaid(() => {
        sent += 1;

        return sent === 1
          ? refusal(503, { detail: 'billing cannot be reached' })
          : HttpResponse.json(bookedInvoice({ status: 'PAID' }));
      }),
    );
    const onClose = vi.fn();
    renderPaid(undefined, onClose);

    await confirmWhenReady('External reference', 'Mark as paid');
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(sent).toBe(2);
  });
});
