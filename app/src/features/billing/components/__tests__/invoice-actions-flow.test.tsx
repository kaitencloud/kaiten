import { useQuery } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Invoice } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetInvoice,
  handleMarkInvoicePaid,
  handleRecomposeInvoice,
  handleReleaseInvoiceHold,
  handleVoidInvoice,
} from '@/api-client/msw.gen';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import {
  buildInvoice,
  buildInvoiceLine,
} from '../../../../../e2e/app/_support/fixtures/build-invoice';
import { billingCapabilities } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { invoiceQueryOptions } from '../../queries';
import { InvoiceActions } from '../invoice-detail/invoice-actions';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from './billing-test-support';

const getAuthToken = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async () =>
  (await import('./billing-test-support')).createRouterModule(navigate),
);

useBillingTexts();

beforeEach(() => {
  // A session that may write billing, as an administrator does.
  getAuthToken.mockResolvedValue(sessionToken(['write:billing']));
  navigate.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  server.use(handleGetBillingCapabilities({ body: billingCapabilities() }));
});

const invoiceWith = (overrides: Partial<Parameters<typeof buildInvoice>[0]>): Invoice =>
  buildInvoice({
    boundaryAt: '2027-03-01T00:00:00.000Z',
    id: 'inv-1',
    lines: [
      buildInvoiceLine({
        amount: 12900,
        description: '1 × $129.00 per month',
        invoiceId: 'inv-1',
        label: 'Pro, monthly',
        seq: 1,
        serviceFrom: '2027-03-01T00:00:00.000Z',
        serviceTo: '2027-04-01T00:00:00.000Z',
        type: 'BASE',
      }),
    ],
    ...overrides,
  });

const held = () =>
  invoiceWith({ holdReason: 'LEDGER_SEQUENCE_GAP', status: 'DRAFT' });
const voided = () => invoiceWith({ status: 'VOID' });
const manual = () => invoiceWith({ status: 'MANUAL' });

/** Renders the actions, and waits until the session's scopes were read: nothing is offered before. */
async function renderActions(invoice: Invoice) {
  const rendered = renderWithClient(<InvoiceActions invoice={invoice} />);
  await waitFor(() =>
    expect(rendered.client.getQueryState(grantedScopesQueryKey)?.status).toBe(
      'success',
    ),
  );

  return rendered;
}

const buttons = () => screen.getByTestId('invoice-actions');

function buttonNamed(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent === name,
  );
  if (!button) {
    throw new Error(`no button ${name}`);
  }

  return button;
}

const buttonNames = () =>
  Array.from(buttons().querySelectorAll('button')).map(
    (button) => button.textContent,
  );

describe('what a session may do to an invoice', () => {
  it('shows the actions of the status, in order', async () => {
    await renderActions(held());

    expect(await screen.findByTestId('invoice-actions')).toBeInTheDocument();
    expect(buttonNames()).toEqual(['Release the hold', 'Recompose', 'Void']);
  });

  it('shows nothing, not even a bar, to a session that may only read', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    await renderActions(held());

    expect(screen.queryByTestId('invoice-actions')).toBeNull();
    expect(screen.queryByTestId('invoice-actions-menu')).toBeNull();
  });

  it('shows every action when the token says nothing of its scopes, and lets the API refuse', async () => {
    getAuthToken.mockResolvedValue(sessionToken([]));
    await renderActions(held());

    expect(await screen.findByTestId('invoice-actions')).toBeInTheDocument();
    expect(buttonNames()).toEqual(['Release the hold', 'Recompose', 'Void']);
  });

  it('shows nothing for an invoice that is final', async () => {
    await renderActions(invoiceWith({ status: 'PAID' }));

    expect(screen.queryByTestId('invoice-actions')).toBeNull();
  });
});

describe('releasing a hold', () => {
  it('asks for the reason, and sends it with the invoice', async () => {
    const sent: Array<{ body: unknown; invoiceId: unknown }> = [];
    server.use(
      handleReleaseInvoiceHold(async ({ params, request }) => {
        sent.push({ body: await request.json(), invoiceId: params.invoiceId });

        return HttpResponse.json(invoiceWith({ status: 'MANUAL' }));
      }),
    );
    await renderActions(held());

    await userEvent.click(buttonNamed(await screen.findByTestId('invoice-actions'), 'Release the hold'));
    await userEvent.type(
      await screen.findByLabelText(/Reason/),
      'Counter verified',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Release' }),
    );

    await waitFor(() =>
      expect(sent).toEqual([
        { body: { reason: 'Counter verified' }, invoiceId: 'inv-1' },
      ]),
    );
    expect(toast.success).toHaveBeenCalledWith('Invoice released');
  });
});

describe('recomposing an invoice', () => {
  const open = async () => {
    await userEvent.click(
      buttonNamed(await screen.findByTestId('invoice-actions'), 'Recompose'),
    );

    return screen.findByRole('alertdialog');
  };
  const confirm = async () => {
    const dialog = await open();
    await userEvent.click(buttonNamed(dialog, 'Recompose'));
  };

  it('closes once the API composed it again', async () => {
    const asked: unknown[] = [];
    server.use(
      handleRecomposeInvoice(({ params }) => {
        asked.push(params.invoiceId);

        return HttpResponse.json(held());
      }),
    );
    await renderActions(held());

    await confirm();

    await waitFor(() => expect(asked).toEqual(['inv-1']));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('leads to the voiding of an invoice that is not a held draft, which cannot be edited', async () => {
    server.use(
      handleRecomposeInvoice(() =>
        refusal(409, {
          code: 'RecomposeInvoice.InvalidStatus',
          detail: 'only a held draft or a void invoice can be recomposed',
        }),
      ),
    );
    await renderActions(held());

    await confirm();

    expect(
      await screen.findByRole('heading', { name: 'Void and recompose' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Recompose the invoice')).toBeNull();
  });

  it('voids and then recomposes with the one reason, and lands on the replacement', async () => {
    const order: string[] = [];
    server.use(
      handleRecomposeInvoice(() => {
        order.push('recompose');

        return HttpResponse.json(invoiceWith({ id: 'inv-2' }), { status: 201 });
      }),
      handleVoidInvoice(async ({ request }) => {
        order.push(`void ${JSON.stringify(await request.json())}`);

        return HttpResponse.json(voided());
      }),
    );
    await renderActions(held());

    // The first attempt is refused for the status, which opens the one confirmation.
    server.use(
      handleRecomposeInvoice(() => {
        order.push('refused');

        return refusal(409, {
          code: 'RecomposeInvoice.InvalidStatus',
          detail: 'void this one first',
        });
      }),
    );
    await confirm();
    await userEvent.type(
      await screen.findByLabelText(/Reason/),
      'Wrong boundary',
    );
    server.use(
      handleRecomposeInvoice(() => {
        order.push('recompose');

        return HttpResponse.json(invoiceWith({ id: 'inv-2' }), { status: 201 });
      }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Void and recompose' }),
    );

    await waitFor(() =>
      expect(order).toEqual([
        'refused',
        'void {"reason":"Wrong boundary"}',
        'recompose',
      ]),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        params: { invoiceId: 'inv-2' },
        to: '/billing/invoices/$invoiceId',
      }),
    );
  });

  it('opens the replacement a void invoice already has, instead of failing', async () => {
    server.use(
      handleRecomposeInvoice(() =>
        refusal(409, {
          code: 'RecomposeInvoice.AlreadyReplaced',
          detail: 'this invoice was already replaced',
          errors: [{ value: { replacementInvoiceId: 'inv-2' } }],
        }),
      ),
    );
    await renderActions(voided());

    await confirm();

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        params: { invoiceId: 'inv-2' },
        to: '/billing/invoices/$invoiceId',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('shows the refusal for a deleted instance, and then offers the recompose disabled, with why', async () => {
    server.use(
      handleRecomposeInvoice(() =>
        refusal(409, {
          code: 'RecomposeInvoice.InstanceDeleted',
          detail: 'the instance of this subscription was deleted',
        }),
      ),
    );
    await renderActions(voided());

    await confirm();
    expect(
      await screen.findByText('the instance of this subscription was deleted'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    expect(buttonNamed(buttons(), 'Recompose')).toBeDisabled();
  });

  it('does not take the next invoice of the page for one whose instance was deleted', async () => {
    server.use(
      handleRecomposeInvoice(() =>
        refusal(409, {
          code: 'RecomposeInvoice.InstanceDeleted',
          detail: 'the instance of this subscription was deleted',
        }),
      ),
    );
    const { rerender } = await renderActions(voided());

    await confirm();
    await screen.findByText('the instance of this subscription was deleted');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(buttonNamed(buttons(), 'Recompose')).toBeDisabled();

    // Another invoice, of another instance, on the same page: nothing is known of it.
    rerender(
      <InvoiceActions
        invoice={{ ...voided(), id: 'inv-2', instanceSlug: 'another-instance' }}
      />,
    );

    expect(buttonNamed(buttons(), 'Recompose')).toBeEnabled();
  });

  it('is offered disabled for a void invoice whose usage is no longer kept', async () => {
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilities({ usageHistoryRetentionMonths: 12 }),
      }),
    );
    await renderActions(
      invoiceWith({
        lines: [
          buildInvoiceLine({
            amount: 100,
            description: 'Base',
            invoiceId: 'inv-1',
            label: 'Base',
            seq: 1,
            serviceFrom: '2019-03-01T00:00:00.000Z',
            serviceTo: '2019-04-01T00:00:00.000Z',
            type: 'BASE',
          }),
        ],
        status: 'VOID',
      }),
    );

    await waitFor(() =>
      expect(buttonNamed(buttons(), 'Recompose')).toBeDisabled(),
    );
  });
});

describe('when someone else got there first', () => {
  // The page the invoice is read on: it reads the invoice as the console does, so
  // that what the API answers after the refusal reaches the actions.
  function InvoicePage() {
    const { data } = useQuery(invoiceQueryOptions('inv-1'));

    return data ? <InvoiceActions invoice={data} /> : null;
  }

  it('keeps the dialog open with the reason, though the invoice no longer offers anything', async () => {
    let current = manual();
    server.use(
      handleGetInvoice(() => HttpResponse.json(current)),
      handleMarkInvoicePaid(() => {
        // The invoice was paid by someone else between the read and the write.
        current = invoiceWith({ status: 'PAID' });

        return refusal(409, {
          code: 'MarkInvoicePaid.InvalidStatus',
          detail: 'only a MANUAL invoice can be marked paid',
        });
      }),
    );
    renderWithClient(<InvoicePage />);

    await userEvent.click(
      buttonNamed(await screen.findByTestId('invoice-actions'), 'Mark as paid'),
    );
    const dialog = await screen.findByRole('dialog');
    // The dialog shows its confirmation before its fields: the form is there once a
    // field is.
    await within(dialog).findByLabelText('External reference');
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Mark as paid' }),
    );

    // The page read the invoice again: nothing is left to offer.
    await waitFor(() =>
      expect(screen.queryByTestId('invoice-actions')).toBeNull(),
    );
    // And the reason is still where it was asked.
    expect(
      within(screen.getByRole('dialog')).getByText(
        'only a MANUAL invoice can be marked paid',
      ),
    ).toBeInTheDocument();
  });
});
