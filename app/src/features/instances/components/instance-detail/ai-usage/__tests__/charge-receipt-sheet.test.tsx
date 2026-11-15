import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import i18n from 'i18next';
import { HttpResponse } from 'msw/http';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { ModelWritable } from '@/api-client';
import { getEntitlementsUsageMetricsOptions } from '@/api-client/@tanstack/react-query.gen';
import { handleGetConversionRule, handleListModels, handleRefundAiInference, handleUpdateModel } from '@/api-client/msw.gen';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import { configureApiClient } from '@/lib/api/configure-api-client';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import en from '@/lib/i18n/locales/en';
import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { ChargeReceiptSheet } from '../receipt/charge-receipt-sheet';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: React.ReactNode }) => <a href="/">{children}</a>,
}));

const POOL = { slug: 'ai-credits', name: 'AI credits', licenseSlug: 'enterprise-v2', limit: 250_000, maximum: 275_000 };
const T = en.AI.Receipt;

// As in the app (`lib/api/bootstrap`): a refusal reaches the screen as an
// `ApiError` that keeps the API's code.
beforeAll(() => configureApiClient());

beforeEach(async () => {
  configure({ asyncUtilTimeout: 30000 });
  i18n.addResourceBundle('en', 'translation', en, true, true);
  await i18n.changeLanguage('en');
});

/** The receipt of a row of Acme Production, over the world of `dev:mock`. */
function renderReceipt(n: number, scopes: readonly string[] | null = null) {
  server.use(...createMockHandlers(createDevMockConfig(), 'off', undefined, true), undeclaredApiRequest);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY }, mutations: { retry: false } },
  });
  setAiAccessInputsForTest(client, { capability: true, flag: true });
  client.setQueryData(grantedScopesQueryKey, scopes);
  render(
    <QueryClientProvider client={client}>
      <ChargeReceiptSheet
        instanceSlug="acme-production"
        pool={POOL}
        transactionId={`txn_acme_${String(n).padStart(3, '0')}`}
        onClose={() => undefined}
      />
    </QueryClientProvider>,
  );

  return client;
}

const section = (name: string) => screen.findByRole('region', { name });
const READ_ONLY = ['read:instances', 'read:models', 'read:licenses', 'read:entitlements'];

describe('the receipt reads what the row stores', () => {
  it('003: rates as applied at commit, the licence of the row by name, the journal sequence and both vendor costs', async () => {
    renderReceipt(3);

    const priced = await section(T.sections.priced);
    expect(priced).toHaveTextContent(T.priced.snapshotUnchanged);
    expect(within(priced).getByText('1.38 credits')).toBeInTheDocument();
    const call = await section(T.sections.call);
    expect(await within(call).findByText(/Enterprise 2026/)).toBeInTheDocument();
    expect(within(call).getByText('enterprise-v2')).toBeInTheDocument();
    expect(call).not.toHaveTextContent(T.call.licenceCurrent);
    expect(await section(T.sections.pool)).toHaveTextContent(T.pool.reportSeq);
    const cost = await section(T.sections.cost);
    expect(cost).toHaveTextContent(T.cost.vendorStored);
    expect(within(cost).getByText('$0.0118')).toBeInTheDocument();
    expect(cost).toHaveTextContent(T.cost.drift);
    expect(within(cost).getByText('+$0.00145')).toBeInTheDocument();
    expect(cost).toHaveTextContent(T.cost.driftAbove);
  });

  it('004: says the rule was edited since and shows today’s value beside each rate that changed', async () => {
    renderReceipt(4);

    const priced = await section(T.sections.priced);
    expect(priced).toHaveTextContent(T.priced.editedSinceHelp);
    expect(within(priced).getByText('0.0002')).toBeInTheDocument();
    expect(within(priced).getByText('now 0.00025')).toBeInTheDocument();
    expect(within(priced).getByText('now 0.00003')).toBeInTheDocument();
    expect(screen.getAllByText(T.priced.editedSince).length).toBeGreaterThan(0);
  });

  it('014: an older row is recomputed from today’s rule, and says so', async () => {
    renderReceipt(14);

    const priced = await section(T.sections.priced);
    expect(priced).toHaveTextContent(T.priced.matches);
    expect(await section(T.sections.call)).toHaveTextContent(T.call.licenceCurrent);
    expect(await section(T.sections.cost)).toHaveTextContent(T.cost.vendorComputed);
  });

  it.each([
    [20, 'COUNTER_PRECISION_DEGRADED'],
    [15, 'PRICING_SNAPSHOT_UNREADABLE'],
    [19, 'NO_RESERVATION'],
  ] as const)('%s: explains the warning %s in plain words', async (n, code) => {
    renderReceipt(n);

    const warnings = await section(T.warnings.title);
    expect(within(warnings).getByText(T.warnings[code])).toBeInTheDocument();
    expect(warnings).toHaveTextContent(T.warnings.help[code]);
  });

  it('019: a release that closed no reservation says what happened, and offers nothing', async () => {
    renderReceipt(19);

    expect(await section(T.sections.happened)).toHaveTextContent(T.happened.noReservation);
    expect(screen.queryByRole('button', { name: /Refund/ })).toBeNull();
  });
});

describe('a session that may not read licences or models', () => {
  const ROW_ONLY = ['read:instances'];
  const forbidden = () =>
    HttpResponse.json(
      { code: 'Forbidden', detail: 'missing scope', status: 403, title: 'Forbidden', type: 'about:blank' },
      { status: 403, headers: { 'Content-Type': 'application/problem+json' } },
    );
  /** The reads of the rule and of the catalogue that leave the page. */
  function recordReads() {
    const asked: string[] = [];
    server.events.on('request:start', ({ request }) => {
      const { pathname } = new URL(request.url);
      if (request.method === 'GET' && /\/(conversion-rules|models)(\/|$)/.test(pathname)) asked.push(pathname);
    });

    return asked;
  }

  it('003: shows the stored facts, asks for neither the rule nor the catalogue, and says what was not read', async () => {
    const asked = recordReads();
    renderReceipt(3, ROW_ONLY);

    const priced = await section(T.sections.priced);
    expect(priced).toHaveTextContent(T.priced.snapshotRuleUnread);
    expect(priced).not.toHaveTextContent('has not changed since');
    expect(within(priced).getByText('1.38 credits')).toBeInTheDocument();
    const call = await section(T.sections.call);
    expect(call).toHaveTextContent(T.call.catalogueUnread);
    expect(within(call).getByText('claude-sonnet-4-5')).toBeInTheDocument();
    expect(call).not.toHaveTextContent(T.call.notInCatalogue);
    expect(within(await section(T.sections.cost)).getByText('$0.0118')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(asked).toEqual([]);
    server.events.removeAllListeners();
  });

  it('014: an older row keeps its stored amounts and says the rule was not read, not that it is gone', async () => {
    renderReceipt(14, ROW_ONLY);

    const priced = await section(T.sections.priced);
    expect(priced).toHaveTextContent('This session may not read licences, so rule');
    expect(priced).not.toHaveTextContent('is not found');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('017: the refunds are listed all the same', async () => {
    renderReceipt(17, ROW_ONLY);

    expect(await section(T.sections.refunds)).toHaveTextContent('Refunded 30.00 of 78.50 credits.');
  });

  it('a 403 on the rule and on the catalogue is "not read", not a failed receipt', async () => {
    renderReceipt(3);
    server.use(handleGetConversionRule(forbidden), handleListModels(forbidden));

    expect(await section(T.sections.priced)).toHaveTextContent(T.priced.snapshotRuleUnread);
    expect(await section(T.sections.call)).toHaveTextContent(T.call.catalogueUnread);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('any other failure of the rule read is still an error, with a retry', async () => {
    renderReceipt(3);
    server.use(handleGetConversionRule(() => HttpResponse.json({ detail: 'down', status: 500, title: 'Error' }, { status: 500 })));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.Common.retry })).toBeInTheDocument();
  });
});

describe('refunding a charge', () => {
  const refundButton = () => screen.findByRole('button', { name: 'Refund 48.50 credits…' });
  const amount = () => screen.getByLabelText(new RegExp(T.refund.amount)) as HTMLInputElement;

  it('017: lists the refunds made, with who, when, why and where in the journal', async () => {
    renderReceipt(17);

    const refunds = await section(T.sections.refunds);
    expect(refunds).toHaveTextContent('Refunded 30.00 of 78.50 credits.');
    expect(refunds).toHaveTextContent('48.50 credits are left to refund.');
    expect(within(refunds).getByText('Duplicate call after a client retry')).toBeInTheDocument();
    expect(refunds).toHaveTextContent('by Ada Lovelace');
    expect(refunds).toHaveTextContent(/journal sequence \d+/);
  });

  it('refunds what is typed, once, then shows it and refreshes the pool', async () => {
    const keys: (string | null)[] = [];
    const client = renderReceipt(17);
    const usage = getEntitlementsUsageMetricsOptions({ path: { instanceSlug: 'acme-production' } });
    await client.fetchQuery(usage);
    fireEvent.click(await refundButton());
    const dialog = await screen.findByRole('dialog', { name: T.refund.title });

    // Everything left by default; more than that is refused before any request.
    expect(amount().value).toBe('48.5');
    expect(dialog).toHaveTextContent('cannot be undone here');
    fireEvent.change(amount(), { target: { value: '50' } });
    expect(await within(dialog).findByText(T.refund.amountExceeds)).toBeInTheDocument();
    fireEvent.change(amount(), { target: { value: 'abc' } });
    expect(await within(dialog).findByText(T.refund.amountInvalid)).toBeInTheDocument();
    // What the button says while it cannot be pressed is about the amount, not about a missing field.
    expect(within(dialog).getByRole('button', { name: T.refund.confirm })).toBeDisabled();
    expect(dialog).toHaveTextContent(T.refund.fixAmount);

    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/refund')) keys.push(request.headers.get('Idempotency-Key'));
    });
    fireEvent.change(amount(), { target: { value: '8.5' } });
    fireEvent.change(screen.getByLabelText(new RegExp(T.refund.reason)), { target: { value: 'goodwill' } });
    fireEvent.click(within(dialog).getByRole('button', { name: T.refund.confirm }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: T.refund.title })).toBeNull());
    const refunds = await section(T.sections.refunds);
    await waitFor(() => expect(refunds).toHaveTextContent('Refunded 38.50 of 78.50 credits.'));
    expect(within(refunds).getByText('goodwill')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Refund 40.00 credits…' })).toBeInTheDocument();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
    expect(client.getQueryState(usage.queryKey)?.isInvalidated).toBe(true);
    server.events.removeAllListeners();
  });

  it('keeps the dialog open on a refusal, says what is left, and retries with the same key', async () => {
    const keys: (string | null)[] = [];
    renderReceipt(17);
    server.use(
      handleRefundAiInference(({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json(
          {
            code: 'RefundAiInference.ExceedsRefundable',
            detail: 'refund exceeds what is left to refund',
            errors: [{ location: 'body.credits', message: 'exceeds', value: '12.5' }],
            status: 409,
            title: 'Conflict',
            type: 'about:blank',
          },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        );
      }),
    );
    fireEvent.click(await refundButton());
    const dialog = await screen.findByRole('dialog', { name: T.refund.title });
    const confirm = within(dialog).getByRole('button', { name: T.refund.confirm });

    fireEvent.click(confirm);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The refund exceeds what is left on this charge: 12.50 credits.',
    );
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[0]).toBe(keys[1]);

    // Another opening of the dialog is another refund: another key.
    fireEvent.click(within(dialog).getByRole('button', { name: en.Common.cancel }));
    fireEvent.click(await refundButton());
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: T.refund.title })).getByRole('button', { name: T.refund.confirm }),
    );
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[2]).not.toBe(keys[0]);
  });

  it.each([
    ['RefundAiInference.NotCommitted', en.AI.Errors.refundNotCommitted],
    ['RefundAiInference.NothingToRefund', en.AI.Errors.refundNothingLeft],
    ['RefundAiInference.PoolNotGranted', en.AI.Errors.refundPoolNotGranted],
    ['RefundAiInference.InferenceNotFound', en.AI.Errors.refundInferenceNotFound],
    ['RefundAiInference.ContextNotFound', en.AI.Errors.poolNotFound],
    ['RefundAiInference.InvalidAmount', en.AI.Errors.refundInvalidAmount],
    ['RefundAiInference.InvalidReason', en.AI.Errors.refundInvalidReason],
    ['RefundAiInference.InvalidIdempotencyKey', en.AI.Errors.refundKeyInvalid],
    ['RefundAiInference.IdempotencyKeyRequired', en.AI.Errors.refundKeyInvalid],
  ])('says %s in its own words', async (code, message) => {
    renderReceipt(17);
    server.use(
      handleRefundAiInference(() =>
        HttpResponse.json(
          { code, detail: 'server words', status: 409, title: 'Conflict', type: 'about:blank' },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    fireEvent.click(await refundButton());
    const dialog = await screen.findByRole('dialog', { name: T.refund.title });
    fireEvent.click(within(dialog).getByRole('button', { name: T.refund.confirm }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
  });

  it('says a charge refunded in full has nothing left, and offers no further refund', async () => {
    renderReceipt(17);
    fireEvent.click(await refundButton());
    const dialog = await screen.findByRole('dialog', { name: T.refund.title });
    // Everything left, as the dialog opens.
    fireEvent.click(within(dialog).getByRole('button', { name: T.refund.confirm }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: T.refund.title })).toBeNull());
    const refunds = await section(T.sections.refunds);
    await waitFor(() => expect(refunds).toHaveTextContent('Refunded 78.50 of 78.50 credits.'));
    expect(refunds).toHaveTextContent(T.refunds.nothingLeft);
    expect(screen.queryByRole('button', { name: /^Refund .* credits…$/ })).toBeNull();
  });

  it('offers no refund without write:instances', async () => {
    renderReceipt(17, READ_ONLY);

    expect(await section(T.sections.refunds)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Refund/ })).toBeNull();
  });

  it.each([
    [7, 'charged nothing'],
    [1, 'not committed'],
    [12, 'expired'],
    [11, 'not authorized'],
  ])('%s: offers no refund on a call that was %s', async (n) => {
    renderReceipt(n);

    await section(T.sections.call);
    expect(screen.queryByRole('button', { name: /Refund/ })).toBeNull();
  });
});

describe('naming an unknown model', () => {
  const action = () => screen.findByRole('button', { name: T.externalId.action });

  it('018: suggests the model whose slug the name starts with, and appends the name to its external ids', async () => {
    const sent: ModelWritable[] = [];
    renderReceipt(18);
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT') void request.clone().json().then((body) => sent.push(body as ModelWritable));
    });
    fireEvent.click(await action());
    const dialog = await screen.findByRole('dialog', { name: T.externalId.title });

    expect(dialog).toHaveTextContent('gpt-5-mini-2025-08-07');
    expect(dialog).toHaveTextContent('Past inferences are not re-priced.');
    expect(within(dialog).getByText('GPT-5 mini')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Suggested: its name starts with the slug of GPT-5 mini.');
    fireEvent.click(within(dialog).getByRole('button', { name: T.externalId.confirm }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: T.externalId.title })).toBeNull());
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ slug: 'gpt-5-mini', externalIds: ['gpt-5-mini-2025-08-07'] });
    server.events.removeAllListeners();

    // The past call stays refused; the receipt says the name is known now, and has nothing left to teach.
    const refused = await section(T.sections.notCharged);
    await waitFor(() => expect(refused).toHaveTextContent('gpt-5-mini-2025-08-07 has been added to GPT-5 mini since.'));
    expect(refused).toHaveTextContent('gpt-5-mini-2025-08-07 is neither a model slug nor an external ID');
    expect(await section(T.sections.call)).toHaveTextContent(T.call.knownSince);
    expect(screen.queryByRole('button', { name: T.externalId.action })).toBeNull();
  });

  it('008: with no obvious model, nothing is chosen and nothing can be sent yet', async () => {
    renderReceipt(8);
    fireEvent.click(await action());
    const dialog = await screen.findByRole('dialog', { name: T.externalId.title });

    expect(within(dialog).getByText(T.externalId.choose)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: T.externalId.confirm })).toBeDisabled();
    expect(within(dialog).getByText(T.externalId.createInstead)).toBeInTheDocument();
  });

  it('shows the refusal of the API when another model owns the name', async () => {
    renderReceipt(18);
    server.use(
      handleUpdateModel(() =>
        HttpResponse.json(
          { code: 'UpdateModel.ExternalIdConflict', detail: 'conflict', status: 409, title: 'Conflict', type: 'about:blank' },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    fireEvent.click(await action());
    const dialog = await screen.findByRole('dialog', { name: T.externalId.title });
    fireEvent.click(within(dialog).getByRole('button', { name: T.externalId.confirm }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(en.AI.Errors.externalIdConflict);
  });

  it('keeps the link to the models and hides the action without write:models', async () => {
    renderReceipt(8, READ_ONLY);

    expect(await screen.findByText(T.actions.openModels)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: T.externalId.action })).toBeNull();
  });
});
