import { describe, expect, it } from 'vite-plus/test';
import type {
  Invoice,
  LineReportPage,
  PageInvoiceSummary,
  PageQueuedInvoice,
} from '@/api-client';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import { BillingAppModel } from '../../e2e/app/_support/model/billing-app-model';
import {
  createEmptyInvoicesModel,
  createInvoicesModel,
  createManyInvoicesModel,
} from '../../e2e/app/billing/billing.scenarios';
import { server } from './msw-server';

// What the mocks standing in for the invoices answer: they filter, page, change
// state and refuse as the API does, with its codes, because the console is
// tested against them. These read the answers off the wire, as the console does.

const API = 'http://api.test/api';

const install = (model: BillingAppModel) => {
  const config: E2EMswConfig = { billing: model.serializeForMsw() };
  server.use(
    ...createMockHandlers(config, 'off', undefined, true),
    undeclaredApiRequest,
  );
};

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  });

const list = async (query = ''): Promise<PageInvoiceSummary> =>
  (await send('GET', `/invoices${query}`)).json();

const ids = (page: PageInvoiceSummary) => page.items.map(({ id }) => id);

const problem = async (response: Response) =>
  (await response.json()) as {
    code?: string;
    detail?: string;
    errorId?: string;
    errors?: Array<{ location?: string; value?: unknown }>;
  };

describe('the list of invoices, as the mocks serve it', () => {
  it('lists the newest invoice first, without its lines', async () => {
    install(createInvoicesModel());

    const page = await list();

    expect(ids(page).slice(0, 3)).toEqual(['inv-h1', 'inv-h2', 'inv-g1']);
    expect(page.items[0]).not.toHaveProperty('lines');
    expect(page.hasMore).toBe(false);
  });

  it.each([
    ['a repeated status', '?status=PAID&status=UNCOLLECTIBLE', ['inv-d1', 'inv-d2', 'inv-u1']],
    ['a kind', '?kind=ACTIVATION', ['inv-m1', 'inv-d2', 'inv-r1', 'inv-v1']],
    ['a customer', '?customerSlug=globex', ['inv-g1', 'inv-d2', 'inv-u1']],
    ['an instance', '?instanceSlug=globex-prod', ['inv-g1', 'inv-d2', 'inv-u1']],
    ['the held ones', '?held=true', ['inv-h1', 'inv-h2']],
    ['the overdue ones', '?overdue=true', ['inv-m1', 'inv-r1']],
    ['a handoff status', '?handoffStatus=PENDING', ['inv-g1', 'inv-p1', 'inv-m1', 'inv-r1']],
    [
      'a boundary period, up to its end excluded',
      '?boundaryFrom=2026-03-01T00:00:00.000Z&boundaryTo=2026-04-01T00:00:00.000Z',
      ['inv-m1'],
    ],
    [
      'an issue period',
      '?issuedFrom=2026-04-01T00:00:00.000Z&issuedTo=2026-04-02T00:00:00.000Z',
      ['inv-g1', 'inv-p1'],
    ],
  ])('filters by %s', async (_name, query, expected) => {
    install(createInvoicesModel());

    expect(ids(await list(query))).toEqual(expected);
  });

  it('reads Stripe invoices as such, and filters them by provider', async () => {
    install(createInvoicesModel({ stripe: true }));

    expect(ids(await list('?providerKind=STRIPE'))).toEqual(['inv-f1', 'inv-s1']);
  });

  it('pages with an opaque cursor, fifty at a time, and ends with no cursor', async () => {
    install(createManyInvoicesModel());

    const first = await list();
    expect(first.items).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(first.items[0].id).toBe('inv-bulk-60');

    const second = await list(`?cursor=${first.nextCursor}`);
    expect(second.items).toHaveLength(10);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeUndefined();
    expect(second.items.at(-1)?.id).toBe('inv-bulk-01');
  });

  it('keeps the filters of a page when it reads the next', async () => {
    install(createManyInvoicesModel());

    const first = await list('?limit=5&status=PAID');
    const second = await list(`?limit=5&status=PAID&cursor=${first.nextCursor}`);

    expect(ids(first)).toEqual(['inv-bulk-60', 'inv-bulk-59', 'inv-bulk-58', 'inv-bulk-57', 'inv-bulk-56']);
    expect(ids(second)).toEqual(['inv-bulk-55', 'inv-bulk-54', 'inv-bulk-53', 'inv-bulk-52', 'inv-bulk-51']);
  });

  it('refuses a cursor it did not give and a period that ends before it starts', async () => {
    install(createInvoicesModel());

    const cursor = await send('GET', '/invoices?cursor=nonsense');
    expect(cursor.status).toBe(400);
    expect((await problem(cursor)).code).toBe('Invoices.InvalidCursor');

    const range = await send(
      'GET',
      '/invoices?boundaryFrom=2026-04-01T00:00:00.000Z&boundaryTo=2026-03-01T00:00:00.000Z',
    );
    expect(range.status).toBe(422);
    expect((await problem(range)).code).toBe('ListInvoices.InvalidFilter');
  });

  it('answers an empty page when nothing was composed', async () => {
    install(createEmptyInvoicesModel());

    expect(await list()).toEqual({ hasMore: false, items: [] });
  });
});

describe('an invoice, as the mocks serve it', () => {
  it('reads it with its lines, hold and handoff', async () => {
    install(createInvoicesModel());

    const invoice = (await (await send('GET', '/invoices/inv-p1')).json()) as Invoice;

    expect(invoice.lines.map(({ seq, type }) => [seq, type])).toEqual([
      [1, 'OVERAGE'],
      [2, 'BASE'],
      [3, 'DISCOUNT'],
    ]);
    expect(invoice).toMatchObject({
      discountTotal: 580,
      handoff: { claimCount: 2, status: 'PENDING' },
      subtotal: 3319,
      total: 2739,
    });
  });

  it('refuses an unknown invoice with its code', async () => {
    install(createInvoicesModel());

    const response = await send('GET', '/invoices/nope');

    expect(response.status).toBe(404);
    expect((await problem(response)).code).toBe('GetInvoice.NotFound');
  });

  it('answers the problem it is armed with, once, with its trace id', async () => {
    const model = createInvoicesModel();
    model.invoices.armProblem('getInvoice', {
      code: 'GetInvoice.Internal',
      detail: 'the database could not be read',
      errorId: 'trace-123',
      status: 500,
    });
    install(model);

    const failed = await send('GET', '/invoices/inv-m1');
    expect(failed.status).toBe(500);
    expect(await problem(failed)).toMatchObject({
      code: 'GetInvoice.Internal',
      errorId: 'trace-123',
    });
    expect((await send('GET', '/invoices/inv-m1')).status).toBe(200);
  });
});

describe('the usage behind a metered line, as the mocks serve it', () => {
  it('pages the reports by report number, with the one to read after', async () => {
    install(createInvoicesModel());

    const first = (await (
      await send('GET', '/invoices/inv-p1/lines/inv-p1-line-1/reports?limit=2')
    ).json()) as LineReportPage;
    const second = (await (
      await send(
        'GET',
        `/invoices/inv-p1/lines/inv-p1-line-1/reports?limit=2&afterSeq=${first.nextAfterSeq}`,
      )
    ).json()) as LineReportPage;
    const last = (await (
      await send('GET', '/invoices/inv-p1/lines/inv-p1-line-1/reports?afterSeq=44')
    ).json()) as LineReportPage;

    expect(first.items.map(({ reportSeq }) => reportSeq)).toEqual([41, 42]);
    expect(first.nextAfterSeq).toBe(42);
    expect(second.items.map(({ reportSeq }) => reportSeq)).toEqual([43, 44]);
    expect(last.items.map(({ reportSeq }) => reportSeq)).toEqual([45]);
    expect(last.nextAfterSeq).toBeUndefined();
  });

  it('streams every report as a CSV', async () => {
    install(createInvoicesModel());

    const response = await send(
      'GET',
      '/invoices/inv-p1/lines/inv-p1-line-1/reports?format=csv',
    );
    const lines = (await response.text()).trim().split('\n');

    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(lines[0]).toContain('report_seq,reported_at');
    expect(lines).toHaveLength(6);
  });

  it('refuses a line that is not metered, an unknown one, and one past the retention', async () => {
    install(createInvoicesModel({ retentionStart: '2026-04-01T00:00:00.000Z' }));

    const flat = await send('GET', '/invoices/inv-p1/lines/inv-p1-line-2/reports');
    expect(flat.status).toBe(422);
    expect((await problem(flat)).code).toBe('ListInvoiceLineReports.NotMetered');

    const unknown = await send('GET', '/invoices/inv-p1/lines/nope/reports');
    expect(unknown.status).toBe(404);
    expect((await problem(unknown)).code).toBe('ListInvoiceLineReports.LineNotFound');

    const purged = await send('GET', '/invoices/inv-p1/lines/inv-p1-line-1/reports');
    const body = await problem(purged);
    expect(purged.status).toBe(422);
    expect(body.code).toBe('ListInvoiceLineReports.OutsideRetention');
    // The refusal carries the line's metering, which is what remains of it.
    expect(body.errors?.[0]).toMatchObject({
      location: 'metering',
      value: { ledger: { firstSeq: 41, lastSeq: 45, rows: 5 } },
    });
  });
});

describe('the export of invoices, as the mocks serve it', () => {
  it('writes one CSV row per line, with the invoice repeated, in minor units', async () => {
    install(createInvoicesModel());

    const response = await send('GET', '/invoices/export?status=PAID&format=csv');
    const rows = (await response.text()).trim().split('\n');

    expect(response.headers.get('content-type')).toContain('text/csv');
    // The columns a spreadsheet reads: no float, the exponent beside the amount.
    expect(rows[0]).toContain('currency_exponent');
    expect(rows[0]).toContain('line_amount_minor');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toContain('inv-d1');
    expect(rows[1]).toContain(',2900,');
  });

  it('writes one row per invoice at the invoice granularity, and NDJSON with its lines', async () => {
    install(createInvoicesModel());

    const byInvoice = (
      await (await send('GET', '/invoices/export?format=csv&granularity=invoice&kind=FINAL')).text()
    )
      .trim()
      .split('\n');
    expect(byInvoice).toHaveLength(1);
    expect(byInvoice[0]).not.toContain('line_seq');

    const ndjson = await send('GET', '/invoices/export?format=json&status=UNCOLLECTIBLE');
    const parsed = (await ndjson.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Invoice);
    expect(ndjson.headers.get('content-type')).toContain('application/x-ndjson');
    expect(parsed.map(({ id }) => id)).toEqual(['inv-u1']);
    expect(parsed[0].lines).toHaveLength(1);
  });

  it('refuses a format and a granularity it does not know, and sends no file name', async () => {
    install(createInvoicesModel());

    const format = await send('GET', '/invoices/export?format=xml');
    expect(format.status).toBe(422);
    expect((await problem(format)).code).toBe('ExportInvoices.InvalidFormat');

    const granularity = await send('GET', '/invoices/export?granularity=day');
    expect(granularity.status).toBe(422);
    expect((await problem(granularity)).code).toBe('ExportInvoices.InvalidGranularity');

    // The stack's CORS exposes no Content-Disposition: the console names its files.
    const file = await send('GET', '/invoices/export');
    expect(file.headers.get('content-disposition')).toBeNull();
  });
});

describe('the actions on an invoice, as the mocks serve them', () => {
  it('releases a held invoice, which is issued and waits in the queue', async () => {
    install(createInvoicesModel());

    const response = await send('POST', '/invoices/inv-h1/release-hold', {
      reason: 'Accepted after review',
    });
    const invoice = (await response.json()) as Invoice;

    expect(response.status).toBe(200);
    expect(invoice).toMatchObject({
      handoff: { claimCount: 0, status: 'PENDING' },
      hold: { releaseReason: 'Accepted after review' },
      status: 'MANUAL',
    });
    expect(invoice.holdReason).toBeUndefined();
    expect(invoice.dueAt).toBeDefined();
  });

  it.each([
    ['inv-m1', {}, 422, 'ReleaseInvoiceHold.ReasonRequired'],
    ['inv-m1', { reason: 'ok' }, 409, 'ReleaseInvoiceHold.NotHeld'],
    ['inv-h1', { reason: 'x'.repeat(501) }, 422, 'ReleaseInvoiceHold.ReasonRequired'],
  ])('refuses to release %s with %o', async (id, body, status, code) => {
    install(createInvoicesModel());

    const response = await send('POST', `/invoices/${id}/release-hold`, body);

    expect(response.status).toBe(status);
    expect((await problem(response)).code).toBe(code);
  });

  it('recomposes a held invoice in place with a 200', async () => {
    install(createInvoicesModel());

    const response = await send('POST', '/invoices/inv-h2/recompose');
    const invoice = (await response.json()) as Invoice;

    expect(response.status).toBe(200);
    expect(invoice.id).toBe('inv-h2');
    expect(invoice).toMatchObject({
      hold: { releaseReason: 'recomposed' },
      status: 'MANUAL',
    });
  });

  it('gives a VOID invoice its replacement with a 201, once', async () => {
    install(createInvoicesModel());

    const created = await send('POST', '/invoices/inv-v2/recompose');
    const replacement = (await created.json()) as Invoice;

    expect(created.status).toBe(201);
    expect(replacement).toMatchObject({
      replacesInvoiceId: 'inv-v2',
      status: 'MANUAL',
    });
    expect(replacement.id).not.toBe('inv-v2');
    expect(
      ((await (await send('GET', '/invoices/inv-v2')).json()) as Invoice)
        .replacedByInvoiceId,
    ).toBe(replacement.id);

    const again = await send('POST', '/invoices/inv-v2/recompose');
    const refused = await problem(again);
    expect(again.status).toBe(409);
    expect(refused.code).toBe('RecomposeInvoice.AlreadyReplaced');
    expect(refused.errors?.[0].value).toEqual({
      replacementInvoiceId: replacement.id,
    });
  });

  it('refuses to recompose what is neither held nor void, or whose instance is gone', async () => {
    install(createInvoicesModel());

    const issued = await send('POST', '/invoices/inv-m1/recompose');
    expect(issued.status).toBe(409);
    expect((await problem(issued)).code).toBe('RecomposeInvoice.InvalidStatus');

    // Globex Production was deleted in the scenario.
    install(createInvoicesModel());
    await send('POST', '/invoices/inv-g1/void', { reason: 'duplicate' });
    const deleted = await send('POST', '/invoices/inv-g1/recompose');
    expect(deleted.status).toBe(409);
    expect((await problem(deleted)).code).toBe('RecomposeInvoice.InstanceDeleted');
  });

  it('marks an invoice paid, which acknowledges what waited in the queue', async () => {
    install(createInvoicesModel());

    const response = await send('POST', '/invoices/inv-m1/mark-paid', {
      externalReference: 'ERP-1001',
      note: 'wire',
      paidAt: '2026-03-03T10:00:00.000Z',
    });
    const invoice = (await response.json()) as Invoice;

    expect(response.status).toBe(200);
    expect(invoice).toMatchObject({
      handoff: { externalReference: 'ERP-1001', status: 'ACKNOWLEDGED' },
      handoffStatus: 'ACKNOWLEDGED',
      paidAt: '2026-03-03T10:00:00.000Z',
      status: 'PAID',
    });
    // The same payment again is the same answer; another reference is a conflict.
    const again = await send('POST', '/invoices/inv-m1/mark-paid', {
      externalReference: 'ERP-1001',
    });
    expect(again.status).toBe(200);
  });

  it.each([
    ['a payment in the future', 'inv-m1', { paidAt: '2999-01-01T00:00:00.000Z' }, 422, 'MarkInvoicePaid.PaidAtInFuture'],
    ['a reference that is too long', 'inv-m1', { externalReference: 'x'.repeat(256) }, 422, 'MarkInvoicePaid.InvalidExternalReference'],
    ['an invoice that is not MANUAL', 'inv-h1', {}, 409, 'MarkInvoicePaid.InvalidStatus'],
    ['a reference that is not the one it was handed off under', 'inv-d1', { externalReference: 'ERP-2' }, 409, 'MarkInvoicePaid.InvalidStatus'],
  ])('refuses %s', async (_name, id, body, status, code) => {
    install(createInvoicesModel());

    const response = await send('POST', `/invoices/${id}/mark-paid`, body);

    expect(response.status).toBe(status);
    expect((await problem(response)).code).toBe(code);
  });

  it('refuses to settle by hand an invoice a payment provider collects', async () => {
    install(createInvoicesModel({ stripe: true }));

    const paid = await send('POST', '/invoices/inv-s1/mark-paid', {});
    expect(paid.status).toBe(409);
    expect((await problem(paid)).code).toBe('MarkInvoicePaid.ProviderManaged');

    const writtenOff = await send('POST', '/invoices/inv-s1/write-off', { reason: 'x' });
    expect(writtenOff.status).toBe(409);
    expect((await problem(writtenOff)).code).toBe('WriteOffInvoice.ProviderManaged');
  });

  it('writes an invoice off, which leaves a pending handoff pending', async () => {
    install(createInvoicesModel());

    const response = await send('POST', '/invoices/inv-m1/write-off', {
      reason: 'customer bankrupt',
    });
    const invoice = (await response.json()) as Invoice;

    expect(invoice.status).toBe('UNCOLLECTIBLE');
    expect(invoice.uncollectibleAt).toBeDefined();
    expect(invoice.handoffStatus).toBe('PENDING');
    expect(
      (await send('POST', '/invoices/inv-m1/write-off', { reason: 'again' })).status,
    ).toBe(200);
    expect((await send('POST', '/invoices/inv-m1/write-off', {})).status).toBe(422);
  });

  it('voids what is not settled, and refuses what is', async () => {
    install(createInvoicesModel());

    const voided = (await (
      await send('POST', '/invoices/inv-m1/void', { reason: 'wrong amount' })
    ).json()) as Invoice;
    expect(voided).toMatchObject({ status: 'VOID', voidReason: 'wrong amount' });

    const paid = await send('POST', '/invoices/inv-d1/void', { reason: 'wrong amount' });
    expect(paid.status).toBe(409);
    expect((await problem(paid)).code).toBe('VoidInvoice.InvalidStatus');
  });

  it('does not change an invoice when an action is refused', async () => {
    const model = createInvoicesModel();
    model.invoices.armProblem('voidInvoice', {
      code: 'Billing.EntitlementCheckUnavailable',
      detail: 'the entitlement could not be checked',
      status: 503,
    });
    install(model);

    expect(
      (await send('POST', '/invoices/inv-m1/void', { reason: 'wrong' })).status,
    ).toBe(503);
    expect(
      ((await (await send('GET', '/invoices/inv-m1')).json()) as Invoice).status,
    ).toBe('MANUAL');
  });
});

describe('the handoff queue, as the mocks serve it', () => {
  it('lists what waits, oldest issue first, with its claims', async () => {
    install(createInvoicesModel());

    const page = (await (await send('GET', '/billing/handoff')).json()) as PageQueuedInvoice;

    expect(page.items.map(({ id }) => id)).toEqual(['inv-r1', 'inv-m1', 'inv-p1', 'inv-g1']);
    expect(page.items.map(({ handoff }) => handoff.claimCount)).toEqual([0, 1, 2, 0]);
  });

  it('lists what was acknowledged, with its reference', async () => {
    install(createInvoicesModel());

    const page = (await (
      await send('GET', '/billing/handoff?status=ACKNOWLEDGED')
    ).json()) as PageQueuedInvoice;

    expect(page.items.map(({ handoff, id }) => [id, handoff.externalReference])).toEqual([
      ['inv-u1', undefined],
      ['inv-d2', 'ERP-0987'],
      ['inv-d1', 'ERP-1001'],
    ]);
    expect((await send('GET', '/billing/handoff?status=NOT_REQUIRED')).status).toBe(422);
  });

  it('acknowledges an invoice by hand, with no lease', async () => {
    install(createInvoicesModel());

    const response = await send('POST', '/billing/handoff/inv-g1/ack', {
      externalReference: 'ERP-9',
    });
    const invoice = (await response.json()) as Invoice;

    expect(invoice.handoff).toMatchObject({
      externalReference: 'ERP-9',
      status: 'ACKNOWLEDGED',
    });
    // Safe to repeat; another reference is refused.
    expect(
      (await send('POST', '/billing/handoff/inv-g1/ack', { externalReference: 'ERP-9' })).status,
    ).toBe(200);
    const mismatch = await send('POST', '/billing/handoff/inv-g1/ack', {
      externalReference: 'ERP-10',
    });
    expect(mismatch.status).toBe(409);
    expect((await problem(mismatch)).code).toBe('AckHandoff.ReferenceMismatch');
  });

  it.each([
    ['an invoice that is not in the queue', 'inv-h1', {}, 409, 'AckHandoff.NotRequired'],
    ['an unknown invoice', 'nope', {}, 404, 'AckHandoff.NotFound'],
    ['a reference that is too long', 'inv-g1', { externalReference: 'x'.repeat(256) }, 422, 'AckHandoff.InvalidExternalReference'],
    ['a lease that is not the invoice\'s', 'inv-p1', { leaseId: 'lease-other' }, 409, 'AckHandoff.LeaseMismatch'],
  ])('refuses %s', async (_name, id, body, status, code) => {
    install(createInvoicesModel());

    const response = await send('POST', `/billing/handoff/${id}/ack`, body);

    expect(response.status).toBe(status);
    expect((await problem(response)).code).toBe(code);
  });
});

describe('what the browser reloads from', () => {
  it('keeps what an action changed and the problem still armed through the serialization', () => {
    const model = createInvoicesModel();
    model.invoices.armProblem('markPaid', {
      code: 'Billing.EntitlementCheckUnavailable',
      detail: 'try later',
      status: 503,
    });
    model.invoices.voidInvoice('inv-m1', 'wrong amount');

    const reloaded = BillingAppModel.fromSerialized(
      JSON.parse(JSON.stringify(model.serializeForMsw())),
    );

    expect(reloaded.invoices.getInvoice('inv-m1').status).toBe('VOID');
    expect(() => reloaded.invoices.markPaid('inv-p1', {})).toThrow('try later');
    // One-shot: it was consumed by the reloaded model.
    expect(reloaded.invoices.markPaid('inv-p1', {}).status).toBe('PAID');
  });

  it('reads a state stored before the invoices existed as an empty organization', () => {
    const model = new BillingAppModel();
    const { invoices: _invoices, ...stored } = model.serializeForMsw();

    const reloaded = BillingAppModel.fromSerialized(stored);

    expect(reloaded.invoices.listInvoices({}).items).toEqual([]);
  });
});
