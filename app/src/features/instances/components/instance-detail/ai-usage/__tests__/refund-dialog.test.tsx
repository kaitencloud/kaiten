import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import i18n from 'i18next';
import { HttpResponse } from 'msw/http';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { refundAiInference } from '@/api-client';
import { handleListAiInferences, handleRefundAiInference } from '@/api-client/msw.gen';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import { configureApiClient } from '@/lib/api/configure-api-client';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import en from '@/lib/i18n/locales/en';
import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { ChargeReceiptSheet } from '../receipt/charge-receipt-sheet';
import { clearRefundHoldsForTest } from '../receipt/refund-attempt';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: React.ReactNode }) => <a href="/">{children}</a>,
}));

const POOL = { slug: 'ai-credits', name: 'AI credits', licenseSlug: 'enterprise-v2', limit: 250_000, maximum: 275_000 };
const PATH = { instanceSlug: 'acme-production', entitlementSlug: 'ai-credits', transactionId: 'txn_acme_017' };
const T = en.AI.Receipt.refund;

type Sent = { key: string | null; body: string };

beforeAll(() => configureApiClient());

beforeEach(async () => {
  configure({ asyncUtilTimeout: 4000 });
  clearRefundHoldsForTest();
  i18n.addResourceBundle('en', 'translation', en, true, true);
  await i18n.changeLanguage('en');
});

afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

/** The receipt of `txn_acme_017` (charged 78.5, 30 refunded, 48.5 left), over the world of `dev:mock`. */
function renderReceipt() {
  server.use(...createMockHandlers(createDevMockConfig(), 'off', undefined, true), undeclaredApiRequest);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY }, mutations: { retry: false } },
  });
  setAiAccessInputsForTest(client, { capability: true, flag: true });
  client.setQueryData(grantedScopesQueryKey, null);
  render(
    <QueryClientProvider client={client}>
      <ChargeReceiptSheet instanceSlug={PATH.instanceSlug} pool={POOL} transactionId={PATH.transactionId} onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

/** Every refund request that leaves the page: its key and its body, byte for byte. */
function recordRefunds() {
  const sent: Sent[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && request.url.endsWith('/refund')) {
      const key = request.headers.get('Idempotency-Key');
      void request
        .clone()
        .text()
        .then((body) => sent.push({ key, body }));
    }
  });

  return sent;
}

/** The API applies the next `count` refunds, and their answers never arrive. */
function loseAnswers(count: number) {
  const real = globalThis.fetch;
  let left = count;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args) => {
    const request = args[0] instanceof Request ? args[0] : new Request(args[0], args[1]);
    const response = await real(...args);
    if (left > 0 && request.method === 'POST' && request.url.endsWith('/refund')) {
      left -= 1;
      throw new TypeError('Failed to fetch');
    }

    return response;
  });
}

const openDialog = async (left: string) => {
  fireEvent.click(await screen.findByRole('button', { name: `Refund ${left} credits…` }));

  return screen.findByRole('dialog', { name: T.title });
};
const amount = () => screen.getByLabelText(new RegExp(T.amount)) as HTMLInputElement;
const reason = () => screen.getByLabelText(new RegExp(T.reason)) as HTMLTextAreaElement;
const refundsSection = () => screen.findByRole('region', { name: en.AI.Receipt.sections.refunds });
const dialogGone = () => waitFor(() => expect(screen.queryByRole('dialog', { name: T.title })).toBeNull());

describe('a refund whose answer is lost cannot be made twice', () => {
  it('freezes the amount and the reason, and trying again replays the same request under the same key', async () => {
    renderReceipt();
    const sent = recordRefunds();
    loseAnswers(1);
    const dialog = await openDialog('48.50');
    fireEvent.change(amount(), { target: { value: '8.5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: T.confirm }));

    // Applied by the API; the answer is lost. The review's scenario was to add
    // a reason now and send again: neither field can be edited.
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(T.unanswered);
    expect(amount()).toBeDisabled();
    expect(reason()).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: T.confirm })).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: T.resend }));
    await dialogGone();

    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    const refunds = await refundsSection();
    // 30 + 8.5, once: not 30 + 8.5 + 8.5.
    await waitFor(() => expect(refunds).toHaveTextContent('Refunded 38.50 of 78.50 credits.'));
  });

  it('stays frozen on what was sent when the dialog is closed and opened again', async () => {
    renderReceipt();
    const sent = recordRefunds();
    loseAnswers(2);
    let dialog = await openDialog('48.50');
    fireEvent.change(amount(), { target: { value: '8,5' } });
    fireEvent.change(reason(), { target: { value: 'goodwill' } });
    fireEvent.click(within(dialog).getByRole('button', { name: T.confirm }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(T.unanswered);
    fireEvent.click(within(dialog).getByRole('button', { name: T.resend }));
    await waitFor(() => expect(sent).toHaveLength(2));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: T.resend })).toBeEnabled());

    fireEvent.click(within(dialog).getByRole('button', { name: en.Common.cancel }));
    await dialogGone();
    // The receipt was read again meanwhile and shows 40 left: the dialog still
    // offers the request that was sent, not a new refund.
    dialog = await openDialog('40.00');
    expect(dialog).toHaveTextContent(T.unanswered);
    expect(amount()).toBeDisabled();
    expect(amount().value).toBe('8.5');
    expect(reason().value).toBe('goodwill');
    expect(within(dialog).queryByRole('button', { name: T.confirm })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: T.resend }));
    await dialogGone();

    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((request) => `${request.key} ${request.body}`)).size).toBe(1);
    expect(JSON.parse(sent[0].body)).toEqual({ credits: '8.5', reason: 'goodwill' });
    await waitFor(async () => expect(await refundsSection()).toHaveTextContent('Refunded 38.50 of 78.50 credits.'));
  });

  it('opens the form again after a refusal by the API, which wrote nothing', async () => {
    renderReceipt();
    server.use(
      handleRefundAiInference(
        () =>
          HttpResponse.json(
            { code: 'RefundAiInference.PoolNotGranted', detail: 'no pool', status: 409, title: 'Conflict', type: 'about:blank' },
            { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
          ),
        { once: true },
      ),
    );
    const dialog = await openDialog('48.50');
    fireEvent.click(within(dialog).getByRole('button', { name: T.confirm }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(en.AI.Errors.refundPoolNotGranted);
    expect(amount()).toBeEnabled();
    expect(reason()).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: T.confirm })).toBeInTheDocument();
  });
});

describe('a key the API says holds another refund', () => {
  const keyReused = () =>
    handleRefundAiInference(
      () =>
        HttpResponse.json(
          { code: 'RefundAiInference.IdempotencyKeyReused', detail: 'key reused', status: 409, title: 'Conflict', type: 'about:blank' },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      { once: true },
    );
  /** A refund that went through without this page knowing: the receipt still shows 48.5 left. */
  const refundElsewhere = (credits: string) =>
    refundAiInference({ body: { credits }, headers: { 'Idempotency-Key': `elsewhere-${credits}` }, path: PATH, throwOnError: true });

  it('reads the row again and starts over from what is left, before anything more can be sent', async () => {
    renderReceipt();
    const dialog = await openDialog('48.50');
    await refundElsewhere('8.5');
    const sent = recordRefunds();
    server.use(keyReused());
    fireEvent.change(amount(), { target: { value: '8.5' } });
    fireEvent.change(reason(), { target: { value: 'again' } });
    fireEvent.click(within(dialog).getByRole('button', { name: T.confirm }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The receipt was read again: 40.00 credits are left to refund.',
    );
    // Nothing was sent again by itself, and the form is on the row as it is now.
    expect(sent).toHaveLength(1);
    expect(amount().value).toBe('40');
    expect(dialog).toHaveTextContent('Up to 40.00 credits are left to refund on this charge.');

    // The next refund is a new one, under a new key, of what the operator now reads.
    fireEvent.click(within(dialog).getByRole('button', { name: T.confirm }));
    await dialogGone();
    expect(sent).toHaveLength(2);
    expect(sent[1].key).not.toBe(sent[0].key);
    expect(JSON.parse(sent[1].body)).toEqual({ credits: '40', reason: 'again' });
    await waitFor(async () => expect(await refundsSection()).toHaveTextContent('Refunded 78.50 of 78.50 credits.'));
  });

  it('closes when the row shows nothing is left', async () => {
    renderReceipt();
    const dialog = await openDialog('48.50');
    await refundElsewhere('48.5');
    const sent = recordRefunds();
    server.use(keyReused());
    fireEvent.click(within(dialog).getByRole('button', { name: T.confirm }));

    await dialogGone();
    expect(sent).toHaveLength(1);
    expect(await refundsSection()).toHaveTextContent(en.AI.Receipt.refunds.nothingLeft);
    expect(screen.queryByRole('button', { name: /^Refund .* credits…$/ })).toBeNull();
  });

  it('sends nothing while the row cannot be read again, even after the dialog is opened again', async () => {
    renderReceipt();
    let dialog = await openDialog('48.50');
    await refundElsewhere('8.5');
    const sent = recordRefunds();
    server.use(
      keyReused(),
      handleListAiInferences(() => HttpResponse.json({ detail: 'down', status: 503, title: 'Unavailable' }, { status: 503 }), {
        once: true,
      }),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: T.confirm }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(T.earlierUnread);
    expect(amount()).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: T.confirm })).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: en.Common.cancel }));
    await dialogGone();
    // The receipt still shows the row it had: 48.5 left, which is no longer true.
    dialog = await openDialog('48.50');
    expect(dialog).toHaveTextContent(T.earlierUnread);
    expect(within(dialog).queryByRole('button', { name: T.confirm })).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: T.readAgain }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('40.00 credits are left to refund.');
    expect(amount().value).toBe('40');
    expect(sent).toHaveLength(1);
  });
});
