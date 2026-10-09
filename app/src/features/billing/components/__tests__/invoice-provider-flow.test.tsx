import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Invoice } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetInvoice,
  handleRetryInvoicePush,
  handleSyncInvoice,
  handleVoidInvoice,
} from '@/api-client/msw.gen';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import {
  buildInvoice,
  buildInvoiceLine,
  buildProviderRecord,
} from '../../../../../e2e/app/_support/fixtures/build-invoice';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { InvoiceActions } from '../invoice-detail/invoice-actions';

const getAuthToken = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);

useBillingTexts();

beforeEach(() => {
  getAuthToken.mockResolvedValue(sessionToken(['write:billing']));
  toast.error.mockReset();
  toast.info.mockReset();
  toast.success.mockReset();
  server.use(
    handleGetBillingCapabilities({
      body: billingCapabilitiesProfiles.stackWithStripe('connected'),
    }),
  );
});

const LINE = buildInvoiceLine({
  amount: 2900,
  description: '1 × $29.00 per month',
  invoiceId: 'inv-1',
  label: 'Pro, monthly',
  seq: 1,
  serviceFrom: '2027-03-01T00:00:00.000Z',
  serviceTo: '2027-04-01T00:00:00.000Z',
  type: 'BASE',
});

const stripe = (overrides: Partial<Parameters<typeof buildInvoice>[0]> = {}): Invoice =>
  buildInvoice({
    boundaryAt: '2027-03-01T00:00:00.000Z',
    collectionMethod: 'SEND_INVOICE',
    id: 'inv-1',
    lines: [LINE],
    provider: buildProviderRecord({ pushedAt: '2027-03-01T00:06:00.000Z' }),
    status: 'PUSHED',
    ...overrides,
  });

const queued = () =>
  stripe({
    issuedAt: null,
    provider: { nextPushAt: '2027-03-01T00:12:00.000Z', pushAttempts: 0 },
    status: 'DRAFT',
  });
const failed = () =>
  stripe({
    issuedAt: null,
    provider: {
      lastPushError: 'customer_tax_location_invalid',
      nextPushAt: '2027-03-02T06:00:00.000Z',
      pushAttempts: 3,
    },
    status: 'PUSH_FAILED',
  });
const inReview = () =>
  stripe({
    issuedAt: null,
    provider: buildProviderRecord({ pushAttempts: 1, status: 'draft' }),
    status: 'DRAFT',
  });

async function renderActions(
  invoice: Invoice,
  props: Partial<Parameters<typeof InvoiceActions>[0]> = {},
) {
  const rendered = renderWithClient(
    <InvoiceActions invoice={invoice} {...props} />,
  );
  await waitFor(() =>
    expect(rendered.client.getQueryState(grantedScopesQueryKey)?.status).toBe(
      'success',
    ),
  );

  return rendered;
}

const buttonNames = async () => {
  const bar = await screen.findByTestId('invoice-actions');

  return Array.from(bar.querySelectorAll('button')).map(
    (button) => button.textContent,
  );
};

const action = async (name: string) =>
  within(await screen.findByTestId('invoice-actions')).getByRole('button', {
    name,
  });

describe('the actions of an invoice Stripe collects', () => {
  it('retries a push that failed, or voids the invoice', async () => {
    await renderActions(failed());

    expect(await buttonNames()).toEqual(['Retry push', 'Void']);
  });

  it('pushes a draft the queue has not pushed yet now', async () => {
    await renderActions(queued());

    expect(await buttonNames()).toEqual(['Push now', 'Void']);
  });

  it('finalizes a draft Stripe holds for a person, reads it back, or voids it', async () => {
    await renderActions(inReview());

    expect(await buttonNames()).toEqual([
      'Finalize in Stripe',
      'Read from Stripe',
      'Void',
    ]);
  });

  it('reads back or voids an invoice Stripe has accepted, and marks it paid in no way', async () => {
    await renderActions(stripe());

    expect(await buttonNames()).toEqual(['Read from Stripe', 'Void']);
  });

  it('offers them to nobody who may only read', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    await renderActions(failed());

    expect(screen.queryByTestId('invoice-actions')).toBeNull();
  });
});

describe('pushing an invoice again', () => {
  it('puts it in the queue, says so, and hands the answer to the page to watch', async () => {
    const asked: string[] = [];
    const answer = queued();
    server.use(
      handleRetryInvoicePush(({ params }) => {
        asked.push(params.invoiceId);

        return HttpResponse.json(answer, { status: 202 });
      }),
    );
    const onPushRequested = vi.fn();
    await renderActions(failed(), { onPushRequested });

    await userEvent.click(await action('Retry push'));

    await waitFor(() => expect(asked).toEqual(['inv-1']));
    await waitFor(() => expect(onPushRequested).toHaveBeenCalledTimes(1));
    expect(onPushRequested.mock.calls[0]?.[0]).toMatchObject({
      id: 'inv-1',
      status: 'DRAFT',
    });
    expect(toast.success).toHaveBeenCalledWith(
      'Push requested. Kaiten checks again every few seconds.',
    );
  });

  it('says it finalized a draft at once, since the answer is not queued', async () => {
    server.use(
      handleRetryInvoicePush(() =>
        HttpResponse.json(stripe({ status: 'PUSHED' }), { status: 202 }),
      ),
    );
    await renderActions(inReview());

    await userEvent.click(await action('Finalize in Stripe'));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Invoice finalized in Stripe',
      ),
    );
  });

  it('cannot be pressed again while it is being asked, nor while the push it asked for runs', async () => {
    server.use(
      handleRetryInvoicePush(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));

        return HttpResponse.json(queued(), { status: 202 });
      }),
    );
    const { rerender } = await renderActions(failed());

    await userEvent.click(await action('Retry push'));
    expect(await action('Retry push')).toBeDisabled();

    rerender(<InvoiceActions invoice={queued()} pushPhase="waiting" />);
    await waitFor(async () =>
      expect(await action('Push now')).toBeDisabled(),
    );
  });

  it('tells the API\'s refusal as a toast, in its own words', async () => {
    server.use(
      handleRetryInvoicePush(() =>
        refusal(409, {
          code: 'RetryInvoicePush.Held',
          detail: 'a held invoice is released or recomposed before it is pushed',
        }),
      ),
    );
    await renderActions(failed());

    await userEvent.click(await action('Retry push'));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'a held invoice is released or recomposed before it is pushed',
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('tells a Stripe that cannot be reached, so that the person knows nothing was changed', async () => {
    server.use(
      handleRetryInvoicePush(() =>
        refusal(503, {
          code: 'RetryInvoicePush.ProviderUnavailable',
          detail: 'the payment provider could not be reached',
        }),
      ),
    );
    await renderActions(inReview());

    await userEvent.click(await action('Finalize in Stripe'));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'the payment provider could not be reached',
      ),
    );
  });
});

describe('reading an invoice back from Stripe', () => {
  it('asks the API to read it, and says so', async () => {
    const asked: string[] = [];
    server.use(
      handleSyncInvoice(({ params }) => {
        asked.push(params.invoiceId);

        return HttpResponse.json(stripe());
      }),
    );
    await renderActions(stripe());

    await userEvent.click(await action('Read from Stripe'));

    await waitFor(() => expect(asked).toEqual(['inv-1']));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Invoice read from Stripe'),
    );
  });

  it('says when what it read is a payment', async () => {
    server.use(
      handleSyncInvoice(() =>
        HttpResponse.json(
          stripe({ paidAt: '2027-03-05T00:00:00.000Z', status: 'PAID' }),
        ),
      ),
    );
    await renderActions(stripe());

    await userEvent.click(await action('Read from Stripe'));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Invoice read from Stripe: it is paid',
      ),
    );
  });

  it('tells a refusal, such as an invoice Stripe does not have', async () => {
    server.use(
      handleSyncInvoice(() =>
        refusal(409, {
          code: 'SyncInvoice.NotPushed',
          detail: 'the invoice is not in a payment provider',
        }),
      ),
    );
    await renderActions(stripe());

    await userEvent.click(await action('Read from Stripe'));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'the invoice is not in a payment provider',
      ),
    );
  });
});

describe('voiding an invoice that is paid in Stripe', () => {
  async function openVoid() {
    await userEvent.click(await action('Void'));
    await userEvent.type(await screen.findByLabelText(/Reason/), 'Billed twice');
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Void invoice',
      }),
    );
  }

  const paidAtProvider = () =>
    refusal(409, {
      code: 'VoidInvoice.InvalidStatus',
      detail: 'the payment provider reports this invoice paid',
      errors: [
        {
          location: 'provider',
          message: 'paid at the provider',
          value: 'paid_at_provider',
        },
      ],
    });

  it('says why it was refused and offers to read the payment instead', async () => {
    server.use(handleVoidInvoice(() => paidAtProvider()));
    await renderActions(stripe());

    await openVoid();

    const notice = await screen.findByTestId('void-paid-at-provider');
    expect(notice).toHaveTextContent('Stripe reports this invoice as paid');
    expect(
      await screen.findByText('the payment provider reports this invoice paid'),
    ).toBeInTheDocument();
    expect(
      within(notice).getByRole('button', { name: 'Read it from Stripe' }),
    ).toBeEnabled();
  });

  it('reads the invoice from Stripe, closes, and leaves the invoice paid', async () => {
    const asked: string[] = [];
    server.use(
      handleVoidInvoice(() => paidAtProvider()),
      handleSyncInvoice(({ params }) => {
        asked.push(params.invoiceId);

        return HttpResponse.json(
          stripe({ paidAt: '2027-03-05T00:00:00.000Z', status: 'PAID' }),
        );
      }),
    );
    await renderActions(stripe());
    await openVoid();

    await userEvent.click(
      await within(await screen.findByTestId('void-paid-at-provider')).findByRole(
        'button',
        { name: 'Read it from Stripe' },
      ),
    );

    await waitFor(() => expect(asked).toEqual(['inv-1']));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toast.success).toHaveBeenCalledWith(
      'Invoice read from Stripe: it is paid',
    );
  });

  it('offers nothing of the kind for any other refusal of a void', async () => {
    server.use(
      handleVoidInvoice(() =>
        refusal(409, {
          code: 'VoidInvoice.InvalidStatus',
          detail: 'a PAID invoice cannot be voided',
        }),
      ),
    );
    await renderActions(stripe());

    await openVoid();

    expect(
      await screen.findByText('a PAID invoice cannot be voided'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('void-paid-at-provider')).toBeNull();
  });
});

describe('watching a push', () => {
  // The watch itself is exercised through the hook, in `use-push-watch.test.tsx`.
  it('is not the actions\' concern: a page that does not watch passes nothing and pushes all the same', async () => {
    server.use(
      handleGetInvoice(() => HttpResponse.json(queued())),
      handleRetryInvoicePush(() => HttpResponse.json(queued(), { status: 202 })),
    );
    await renderActions(failed());

    await userEvent.click(await action('Retry push'));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});
