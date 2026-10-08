import { readFile } from 'node:fs/promises';
import { expect, recordWrites, test } from '../_support/app-test';
import { expectFitsItsContainer } from '../_support/assertions/layout';
import { expectErrorToast } from '../_support/assertions/toast';
import { BillingInvoicesDriver } from '../_support/drivers/billing-invoices.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { BillingAppModel } from '../_support/model/billing-app-model';
import { billingCapabilitiesProfiles } from '../_support/model/billing-capabilities';
import { invoiceSet } from './invoice-fixtures';
import {
  createEmptyInvoicesModel,
  createInvoicesModel,
  createManyInvoicesModel,
} from './billing.scenarios';

// The invoices of the organization, across its customers and instances: what
// finance reads to see what was composed, what is overdue and what waits for the
// accounting system. The filters are the API's and live in the URL; the list is
// paged by cursor, and the export takes the filters of the screen.

const NEWEST_FIRST = [
  'inv-h1',
  'inv-h2',
  'inv-g1',
  'inv-p1',
  'inv-m1',
  'inv-d1',
  'inv-d2',
  'inv-u1',
  'inv-r1',
  'inv-v1',
  'inv-v2',
];

test.describe('the list of invoices', () => {
  test('keeps all its columns within a laptop, even for periods that start in the middle of a day', async ({
    page,
  }) => {
    // A subscription that bills from the middle of a day writes the time on both ends
    // of its periods, which is wider than any other column.
    const { invoices, lineReports } = invoiceSet();
    const fromThePartOfTheDay = (instant: string) =>
      new Date(Date.parse(instant) + (18 * 60 + 17) * 60 * 1000).toISOString();
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(
      page,
      new BillingAppModel({
        capabilities: billingCapabilitiesProfiles.stack(),
        invoices: invoices.map((invoice) => ({
          ...invoice,
          serviceFrom: fromThePartOfTheDay(invoice.serviceFrom),
          serviceTo: fromThePartOfTheDay(invoice.serviceTo),
        })),
        lineReports,
      }),
    );
    await page.setViewportSize({ height: 800, width: 1280 });

    await list.goto();

    await expect(list.rows()).toHaveCount(11);
    await expect(list.row('inv-m1')).toContainText('6:17 PM');
    await expectFitsItsContainer(page.getByRole('table').first());
  });

  test('lists the invoices newest first, with how many it shows', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto();

    await list.expectInvoiceIds(NEWEST_FIRST);
    await expect(list.rows()).toHaveCount(11);
  });

  test('shows who an invoice is for, what it bills, for how much and where it stands', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto();

    const first = list.row('inv-m1');
    await expect(first).toContainText('Initech');
    await expect(first).toContainText('initech-prod');
    await expect(first).toContainText('Activation');
    await expect(first).toContainText('Mar 1, 2026 (UTC)');
    // The period, one end above the other: the dash ends the first line.
    await expect(first).toContainText('Mar 1 –');
    await expect(first).toContainText('Apr 1, 2026 (UTC)');
    await expect(first).toContainText('$29.00');
    await expect(first).toContainText('Mar 31, 2026 (UTC)');
    await expect(first).toContainText('Waiting for your ERP');

    // The total is the API's: the line of 4.19, the base of 29.00 and the
    // discount of 5.80 come to what the invoice says, and the list says it.
    await expect(list.row('inv-p1')).toContainText('$27.39');
    await expect(list.row('inv-g1')).toContainText('Globex');
  });

  test('says each status in words: overdue, held, ready to bill, paid, written off, void', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto();

    // Overdue is not a status of the API: an unpaid invoice past its due date.
    await expect(list.statusBadge('inv-m1')).toHaveText('Overdue');
    // One due after today is ready to bill, and never a failure.
    await expect(list.statusBadge('inv-p1')).toHaveText('Ready to bill');
    await expect(list.statusBadge('inv-g1')).toHaveText('Ready to bill');
    await expect(list.statusBadge('inv-h1')).toHaveText('Held');
    await expect(list.statusBadge('inv-d1')).toHaveText('Paid');
    await expect(list.statusBadge('inv-u1')).toHaveText('Written off');
    await expect(list.statusBadge('inv-v1')).toHaveText('Void');
  });

  test('says on hover and on focus why a draft is held', async ({ page }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto();
    await list.statusBadge('inv-h1').hover();

    await expect(
      page.getByRole('tooltip').filter({
        hasText: 'Usage reports are missing from the journal',
      }),
    ).toBeVisible();
  });

  test('leaves the provider column out where NoOp is the only provider', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto();

    await expect(
      page.getByRole('columnheader', { name: 'Provider', exact: true }),
    ).toHaveCount(0);
  });

  test('shows the provider where Stripe is connected', async ({ page }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel({ stripe: true }));

    await list.goto();

    await expect(
      page.getByRole('columnheader', { name: 'Provider', exact: true }),
    ).toBeVisible();
    await expect(list.row('inv-s1')).toContainText('Stripe');
    await expect(list.row('inv-m1')).toContainText('Manual');
  });

  test('leads a row to its invoice', async ({ page }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto();
    await list.link('inv-p1').click();

    await expect(page).toHaveURL(/\/billing\/invoices\/inv-p1$/);
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /^Renewal invoice, Apr 1, 2026/,
      }),
    ).toBeVisible();
  });
});

test.describe('the filters of the list', () => {
  test('are sent to the API as they are set, mirrored in the URL, kept by a reload, and cleared to the bare path', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const reads = recordWrites(page, /\/api\/invoices$/, ['GET']);
    await installBillingAppMocks(page, createInvoicesModel({ stripe: true }));

    await list.goto();
    await list.toggleStatus('Ready to bill');
    await list.toggleStatus('Awaiting payment');
    await list.choose('Kind', 'Renewal');
    await list.choose('Provider', 'Stripe');
    await list.choose('Handoff', 'Waiting for your ERP');
    await list.setSwitch('Overdue invoices only', true);
    await list.setSlug('Customer', 'initech');
    await list.setPeriod('Boundary', '2026-03-01', '2026-04-01');
    await list.closeFilters();

    // What the API was asked for, with the page size of the list.
    await expect
      .poll(() => reads.at(-1)?.search ?? '', { timeout: 15_000 })
      .toContain('boundaryTo=');
    const asked = new URLSearchParams(reads.at(-1)?.search);
    expect(asked.getAll('status')).toEqual(['MANUAL', 'PUSHED']);
    expect(asked.get('kind')).toBe('RENEWAL');
    expect(asked.get('providerKind')).toBe('STRIPE');
    expect(asked.get('overdue')).toBe('true');
    expect(asked.get('handoffStatus')).toBe('PENDING');
    expect(asked.get('customerSlug')).toBe('initech');
    expect(asked.get('boundaryFrom')).toBe('2026-03-01T00:00:00.000Z');
    expect(asked.get('boundaryTo')).toBe('2026-04-01T00:00:00.000Z');
    expect(asked.get('limit')).toBe('50');
    // A filter that is off is not sent.
    expect(asked.has('held')).toBe(false);

    // The URL holds the same filters.
    const params = list.searchParams();
    expect(JSON.parse(params.get('status') ?? '[]')).toEqual([
      'MANUAL',
      'PUSHED',
    ]);
    expect(params.get('kind')).toBe('RENEWAL');
    expect(params.get('providerKind')).toBe('STRIPE');
    expect(params.get('overdue')).toBe('true');
    expect(params.get('handoffStatus')).toBe('PENDING');
    expect(params.get('customerSlug')).toBe('initech');

    // Reloading restores them: the chips say each one.
    await page.reload();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Invoices' }),
    ).toBeVisible();
    await list.expectChips([
      'Status: Ready to bill, Awaiting payment',
      'Kind: Renewal',
      'Provider: Stripe',
      'Handoff: Waiting for your ERP',
      'Overdue',
      'Customer: initech',
      'Boundary: Mar 1, 2026 (UTC) → Apr 1, 2026 (UTC)',
    ]);

    // Clearing returns to the path with no search at all.
    await list.clearFilters().click();
    await expect.poll(() => list.pathAndSearch()).toBe('/billing/invoices');
    await list.expectInvoiceIds([
      'inv-h1',
      'inv-h2',
      'inv-f1',
      'inv-s1',
      'inv-g1',
      'inv-p1',
      'inv-m1',
      'inv-d1',
      'inv-d2',
      'inv-u1',
      'inv-r1',
      'inv-v1',
      'inv-v2',
    ]);
  });

  test('narrow the list on the server: only what they select is listed', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto();
    await list.setSwitch('Overdue invoices only', true);
    await list.closeFilters();
    // The first invoice, and the replacement of a void one: both are past due.
    await list.expectInvoiceIds(['inv-m1', 'inv-r1']);
    await expect(list.rows()).toHaveCount(2);

    await list.clearFilters().click();
    await list.setSwitch('Held drafts only', true);
    await list.closeFilters();
    await list.expectInvoiceIds(['inv-h1', 'inv-h2']);
  });

  test('take off one at a time, from the chip that names it', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto('?kind=ACTIVATION&customerSlug=globex');
    await list.expectChips(['Kind: Activation', 'Customer: globex']);
    await list.expectInvoiceIds(['inv-d2']);

    await list.removeChip('Kind: Activation');

    await list.expectChips(['Customer: globex']);
    await list.expectInvoiceIds(['inv-g1', 'inv-d2', 'inv-u1']);
    expect(list.searchParams().has('kind')).toBe(false);
  });

  test('are read from a link, a status given once as well as a list', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto('?status=PAID&customerSlug=globex');

    await list.expectChips(['Status: Paid', 'Customer: globex']);
    await list.expectInvoiceIds(['inv-d2']);
  });

  test('that are not filters are dropped, and the list opens with the rest', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto('?kind=NOT_A_KIND&status=PAID&overdue=false');

    await list.expectChips(['Status: Paid']);
    await list.expectInvoiceIds(['inv-d1', 'inv-d2']);
  });

  test('reject a period that ends before it starts, and do not send it', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const reads = recordWrites(page, /\/api\/invoices$/, ['GET']);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto();
    await list.setPeriod('Boundary', '2026-04-01', null);
    // The start alone is a period open at its end: it is applied.
    await expect
      .poll(() => reads.at(-1)?.search ?? '', { timeout: 15_000 })
      .toContain('boundaryFrom=');

    await list.setPeriod('Boundary', null, '2026-03-01');

    await expect(
      list.panel().getByText('The period must end after it starts.'),
    ).toBeVisible();
    // The end before the start is not sent, and is not in the URL.
    const sent = reads.length;
    await list.closeFilters();
    expect(reads.length).toBe(sent);
    expect(
      reads.some((read) => (read.search ?? '').includes('boundaryTo=')),
    ).toBe(false);
    expect(list.searchParams().has('boundaryTo')).toBe(false);
  });
});

test.describe('the paging of the list', () => {
  test('reads fifty invoices, then the rest when asked, with the same filters', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const reads = recordWrites(page, /\/api\/invoices$/, ['GET']);
    await installBillingAppMocks(page, createManyInvoicesModel());

    await list.goto();

    await expect(list.rows()).toHaveCount(50);
    await expect(list.rows()).toHaveCount(50);
    // The newest is first, whatever the page it is on.
    expect((await list.invoiceIds())[0]).toBe('inv-bulk-60');
    expect(reads).toHaveLength(1);
    expect(new URLSearchParams(reads[0].search).get('limit')).toBe('50');
    expect(new URLSearchParams(reads[0].search).has('cursor')).toBe(false);

    await list.loadMore().click();

    await expect(list.rows()).toHaveCount(60);
    await expect(list.rows()).toHaveCount(60);
    await expect(list.loadMore()).toHaveCount(0);
    expect(reads).toHaveLength(2);
    const next = new URLSearchParams(reads[1].search);
    expect(next.get('cursor')).toBeTruthy();
    expect(next.get('limit')).toBe('50');
    // The rows already read stayed where they were.
    expect((await list.invoiceIds())[0]).toBe('inv-bulk-60');
  });

  test('offers no more when the first page is the only one', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto();

    await expect(list.rows()).toHaveCount(11);
    await expect(list.loadMore()).toHaveCount(0);
  });
});

test.describe('the states of the list', () => {
  test('says there is nothing yet, and where an invoice comes from', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createEmptyInvoicesModel());

    await list.goto();

    await expect(list.empty()).toContainText('No invoices yet');
    await expect(
      list.empty().getByRole('link', { name: 'Go to instances' }),
    ).toHaveAttribute('href', '/customers/instances');
    await expect(
      list.empty().getByRole('button', { name: 'Clear filters' }),
    ).toHaveCount(0);
  });

  test('says no invoice matches the filters, and clears them from the message', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto('?customerSlug=nobody');

    await expect(list.empty()).toContainText(
      'No invoice matches these filters',
    );
    await list.empty().getByRole('button', { name: 'Clear filters' }).click();

    await expect.poll(() => list.pathAndSearch()).toBe('/billing/invoices');
    await expect(list.rows()).toHaveCount(11);
  });

  test('shows why the API refused, with the trace of a failure that is the server’s, and reads again when asked', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const model = createInvoicesModel();
    model.invoices.armProblem('listInvoices', {
      detail: 'the invoice store is unavailable',
      errorId: 'trace-list-1',
      status: 500,
    });
    await installBillingAppMocks(page, model);

    await list.goto();

    await expect(list.error()).toContainText(
      'the invoice store is unavailable',
    );
    await expect(list.error()).toContainText('Reference trace-list-1');
    // The console around it still works.
    await expect(
      page.getByRole('link', { name: 'Handoff', exact: true }),
    ).toBeVisible();

    await list.error().getByRole('button', { name: 'Retry' }).click();

    await expect(list.rows()).toHaveCount(11);
    await expect(list.error()).toHaveCount(0);
  });

  test('names the scope a session lacks, and offers no retry that would change nothing', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const model = createInvoicesModel();
    model.invoices.armProblem('listInvoices', {
      code: 'Auth.MissingScope',
      detail: 'missing required scope: read:billing',
      status: 403,
    });
    await installBillingAppMocks(page, model);

    await list.goto();

    await expect(list.error()).toContainText('read:billing');
    await expect(list.error()).toContainText('token template');
    await expect(
      list.error().getByRole('button', { name: 'Retry' }),
    ).toHaveCount(0);
  });

  test('keeps the invoices already read when the next page cannot be', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const model = createManyInvoicesModel();
    model.invoices.armProblem('listInvoices', {
      after: 1,
      detail: 'the invoice store is unavailable',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await list.goto();
    await expect(list.rows()).toHaveCount(50);
    await list.loadMore().click();

    await expect(
      page.getByText('the invoice store is unavailable'),
    ).toBeVisible();
    await expect(list.rows()).toHaveCount(50);
    await expect(list.loadMore()).toBeVisible();
  });
});

test.describe('the export of the list', () => {
  test('offers three files, and sends the filters of the screen with the shape each one is', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const exports = recordWrites(page, /\/api\/invoices\/export$/, ['GET']);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto('?status=MANUAL&overdue=true');
    await list.expectInvoiceIds(['inv-m1', 'inv-r1']);

    // A CSV with a row for every line of the invoices selected.
    const lines = await list.export('CSV by invoice line');
    expect(lines.suggestedFilename()).toMatch(
      /^invoices-by-line-\d{8}T\d{6}Z\.csv$/,
    );
    const linesQuery = new URLSearchParams(exports[0].search);
    expect(linesQuery.getAll('status')).toEqual(['MANUAL']);
    expect(linesQuery.get('overdue')).toBe('true');
    expect(linesQuery.get('format')).toBe('csv');
    expect(linesQuery.get('granularity')).toBe('line');

    // A CSV with a row for every invoice.
    const invoices = await list.export('CSV by invoice');
    expect(invoices.suggestedFilename()).toMatch(
      /^invoices-by-invoice-\d{8}T\d{6}Z\.csv$/,
    );
    const invoicesQuery = new URLSearchParams(exports[1].search);
    expect(invoicesQuery.get('format')).toBe('csv');
    expect(invoicesQuery.get('granularity')).toBe('invoice');
    const csv = await readFile((await invoices.path()) ?? '', 'utf8');
    expect(csv).toContain('inv-m1');
    expect(csv).toContain('inv-r1');
    // Only what the filters select: this one is not past due.
    expect(csv).not.toContain('inv-p1');

    // NDJSON: an invoice and its lines on each line, with no granularity, which
    // only a CSV has.
    const ndjson = await list.export('NDJSON, one invoice per line');
    expect(ndjson.suggestedFilename()).toMatch(
      /^invoices-\d{8}T\d{6}Z\.ndjson$/,
    );
    const ndjsonQuery = new URLSearchParams(exports[2].search);
    expect(ndjsonQuery.get('format')).toBe('json');
    expect(ndjsonQuery.has('granularity')).toBe(false);

    // The export pages by itself: it takes neither a cursor nor a limit.
    for (const query of [linesQuery, invoicesQuery, ndjsonQuery]) {
      expect(query.has('cursor')).toBe(false);
      expect(query.has('limit')).toBe(false);
    }
  });

  test('exports every invoice the filters select, not only the page that was read', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createManyInvoicesModel());

    await list.goto();
    await expect(list.rows()).toHaveCount(50);

    const file = await list.export('CSV by invoice');

    const csv = await readFile((await file.path()) ?? '', 'utf8');
    expect(csv.trim().split('\n')).toHaveLength(61);
  });

  test('shows the refusal of the API as it was written, and the list stays as it was', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const model = createInvoicesModel();
    model.invoices.armProblem('exportInvoices', {
      code: 'ExportInvoices.InvalidGranularity',
      detail: 'granularity is line or invoice',
      status: 422,
    });
    await installBillingAppMocks(page, model);

    await list.goto();
    await list.openExportMenu();
    await page
      .getByRole('menuitem', { name: 'CSV by invoice', exact: true })
      .click();

    await expectErrorToast(page, 'granularity is line or invoice');
    await expect(list.rows()).toHaveCount(11);
    await expect(list.exportButton()).toBeEnabled();
  });
});
