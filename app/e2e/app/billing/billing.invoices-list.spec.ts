import { readFile } from 'node:fs/promises';
import { expect, recordWrites, test } from '../_support/app-test';
import {
  expectFitsItsContainer,
  expectOnScreen,
} from '../_support/assertions/layout';
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
// accounting system. The console reads every invoice of the scope, 200 at a time,
// and searches, filters, sorts and pages them itself like any other list; the URL
// holds the scope alone, a customer or an instance, which the API applies, and the
// export takes the scope and the filters of the screen that the API has too.

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

    await list.gotoShowingEverything();

    await expect(list.rows()).toHaveCount(11);
    await expect(list.row('inv-m1')).toContainText('6:17 PM');
    await expectFitsItsContainer(page.getByRole('table').first());
  });

  test('lists the invoices by the boundary they bill, newest first', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything();

    await list.expectInvoiceIds(NEWEST_FIRST);
    await expect(list.rows()).toHaveCount(11);
  });

  test('sorts by the column whose header is pressed, and reverses it on a second press', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything();
    await list.sortBy('Customer');

    // Globex before Initech: its three invoices open the list.
    expect(new Set((await list.invoiceIds()).slice(0, 3))).toEqual(
      new Set(['inv-g1', 'inv-d2', 'inv-u1']),
    );

    await list.sortBy('Customer');

    expect(new Set((await list.invoiceIds()).slice(-3))).toEqual(
      new Set(['inv-g1', 'inv-d2', 'inv-u1']),
    );
  });

  test('shows who an invoice is for, what it bills, for how much and where it stands', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything();

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

    await list.gotoShowingEverything();

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

    await list.gotoShowingEverything();
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

    await list.gotoShowingEverything();

    await expect(
      page.getByRole('columnheader', { name: 'Provider', exact: true }),
    ).toHaveCount(0);
  });

  test('shows the provider where Stripe is connected', async ({ page }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel({ stripe: true }));

    await list.gotoShowingEverything();

    await expect(
      page.getByRole('columnheader', { name: 'Provider', exact: true }),
    ).toBeVisible();
    await expect(list.row('inv-s1')).toContainText('Stripe');
    await expect(list.row('inv-m1')).toContainText('Manual');
  });

  test('leads a row to its invoice', async ({ page }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything();
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

test.describe('the search of the list', () => {
  test('finds an invoice by its customer, its instance or its identifier, in the browser', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const reads = recordWrites(page, /\/api\/invoices$/, ['GET']);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything();

    // The name of a customer, in any case.
    await list.search('GLOBEX');
    await list.expectInvoiceIds(['inv-g1', 'inv-d2', 'inv-u1']);

    // The slug of an instance, a part of it.
    await list.search('initech-pr');
    await expect(list.row('inv-p1')).toBeVisible();
    await expect(list.row('inv-g1')).toHaveCount(0);

    // The identifier of an invoice.
    await list.search('inv-p');
    await list.expectInvoiceIds(['inv-p1']);

    // The console holds every invoice: nothing more was asked of the API, and the
    // URL does not carry the search.
    expect(reads).toHaveLength(1);
    expect(list.pathAndSearch()).toBe('/billing/invoices');
  });

  test('says no invoice matches, and clears the search from the message', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto();
    await list.search('nobody');

    await expect(list.empty()).toContainText(
      'No invoice matches these filters',
    );
    await list.empty().getByRole('button', { name: 'Clear filters' }).click();

    await expect(list.searchField()).toHaveValue('');
    await expect(list.rows()).toHaveCount(10);
    await expect(page.getByText('Showing 1-10 of 11 records')).toBeVisible();
  });
});

test.describe('the filters of the list', () => {
  test('are picked from the Filter menu, narrow the rows in the browser and say themselves in chips', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const reads = recordWrites(page, /\/api\/invoices$/, ['GET']);
    await installBillingAppMocks(page, createInvoicesModel({ stripe: true }));

    await list.gotoShowingEverything();
    await expect(list.rows()).toHaveCount(13);

    // Several statuses at once: the editor stays open for the next.
    await list.addFilter('Status');
    await list.pick('Ready to bill');
    await list.pick('Awaiting payment');
    await list.closeEditor();
    await list.expectInvoiceIds([
      'inv-s1',
      'inv-g1',
      'inv-p1',
      'inv-m1',
      'inv-r1',
    ]);

    // A yes/no filter: the invoices past their due date, as the badge says them.
    await list.addFilter('Overdue');
    await list.pick('True');
    await list.expectInvoiceIds(['inv-m1', 'inv-r1']);

    await list.addFilter('Kind');
    await list.pick('Activation');
    await list.addFilter('Handoff');
    await list.pick('Waiting for your ERP');
    await list.expectInvoiceIds(['inv-m1', 'inv-r1']);
    await list.expectChips([
      'Status: Ready to bill, Awaiting payment',
      'Overdue: True',
      'Kind: Activation',
      'Handoff: Waiting for your ERP',
    ]);

    // Nothing is both: the message offers to clear what hides everything.
    await list.addFilter('Provider');
    await list.pick('Stripe');
    await expect(list.empty()).toContainText(
      'No invoice matches these filters',
    );

    await list.removeFilter('Provider');
    await list.expectInvoiceIds(['inv-m1', 'inv-r1']);

    // The console holds every invoice: it did not ask the API again, and the
    // URL does not carry a filter.
    expect(reads).toHaveLength(1);
    expect(list.pathAndSearch()).toBe('/billing/invoices');

    // Resetting takes every filter off at once.
    await list.reset().click();
    await expect(list.chips()).toHaveCount(0);
    await expect(list.rows()).toHaveCount(13);
  });

  test('select the held drafts and the invoices issued on a day', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything();
    await list.addFilter('Held');
    await list.pick('True');
    await list.expectInvoiceIds(['inv-h1', 'inv-h2']);

    await list.reset().click();
    await list.addFilter('Issued');
    // A day is a UTC day, as everywhere in billing.
    await list.pickDay('Issued', '2026-03-01');
    await list.closeEditor();

    await list.expectInvoiceIds(['inv-m1']);
    await list.expectChips(['Issued is 2026-03-01']);
  });

  test('take off one at a time, from the chip that names it', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything();
    await list.addFilter('Kind');
    await list.pick('Activation');
    await list.search('globex');
    await list.expectInvoiceIds(['inv-d2']);

    await list.removeFilter('Kind');

    await list.expectInvoiceIds(['inv-g1', 'inv-d2', 'inv-u1']);
    await expect(list.chips()).toHaveCount(0);
  });

  test('are not kept by a reload: the URL holds the scope and nothing else', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything();
    await list.addFilter('Kind');
    await list.pick('Activation');
    await expect(list.chips()).toHaveCount(1);
    expect(list.pathAndSearch()).toBe('/billing/invoices');

    await page.reload();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Invoices' }),
    ).toBeVisible();
    await expect(list.chips()).toHaveCount(0);
  });
});

test.describe('the scope of the list', () => {
  test('is read from a link, asked of the API, said in a chip, and taken off to the bare path', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const reads = recordWrites(page, /\/api\/invoices$/, ['GET']);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything('?customerSlug=globex');

    await list.expectChips(['Customer: globex']);
    await list.expectInvoiceIds(['inv-g1', 'inv-d2', 'inv-u1']);
    // The API applies the scope: it matches the slug a customer has now as well as
    // the one an invoice was composed under.
    const asked = new URLSearchParams(reads[0].search);
    expect(asked.get('customerSlug')).toBe('globex');
    expect(asked.get('limit')).toBe('200');

    await list.removeScope('Customer: globex');

    await expect.poll(() => list.pathAndSearch()).toBe('/billing/invoices');
    await expect(list.chips()).toHaveCount(0);
    await expect(page.getByText(/Showing 1-\d+ of 11 records/)).toBeVisible();
    expect(new URLSearchParams(reads.at(-1)?.search).has('customerSlug')).toBe(
      false,
    );
  });

  test('is a chip for the instance as well, and the filters of the screen apply within it', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const reads = recordWrites(page, /\/api\/invoices$/, ['GET']);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything('?instanceSlug=initech-prod');
    await list.addFilter('Kind');
    await list.pick('Activation');

    await list.expectChips(['Instance: initech-prod', 'Kind: Activation']);
    await list.expectInvoiceIds(['inv-m1', 'inv-r1', 'inv-v1']);
    // The scope is in the URL and asked of the API; the filter is neither.
    expect(list.pathAndSearch()).toBe(
      '/billing/invoices?instanceSlug=initech-prod',
    );
    expect(reads).toHaveLength(1);
    expect(new URLSearchParams(reads[0].search).get('instanceSlug')).toBe(
      'initech-prod',
    );
    expect(new URLSearchParams(reads[0].search).has('kind')).toBe(false);

    await list.removeScope('Instance: initech-prod');

    // The filter stays where it was, on every invoice now.
    await expect.poll(() => list.pathAndSearch()).toBe('/billing/invoices');
    await list.expectChips(['Kind: Activation']);
    await list.expectInvoiceIds(['inv-m1', 'inv-d2', 'inv-r1', 'inv-v1']);
  });

  test('keeps the scope of an older link, applies the filters a health tile leads with, and drops the others it carried', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const reads = recordWrites(page, /\/api\/invoices$/, ['GET']);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything(
      '?customerSlug=globex&kind=ACTIVATION&status=PAID&providerKind=STRIPE',
    );

    // The status is one of the four a link may start the list on; the kind and the provider are not.
    await list.expectChips(['Customer: globex', 'Status: Paid']);
    await list.expectInvoiceIds(['inv-d2']);
    // The filters run in the browser: the API is asked for the scope and nothing else.
    const asked = new URLSearchParams(reads[0].search);
    expect(asked.get('customerSlug')).toBe('globex');
    for (const dropped of ['kind', 'status', 'providerKind']) {
      expect(asked.has(dropped), `${dropped} was sent`).toBe(false);
    }
  });

  test('keeps the Filter button and the export within the page at the width of a tablet, with a chip for the customer and one for the instance', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());
    await page.setViewportSize({ height: 900, width: 820 });

    await list.goto('?customerSlug=initech&instanceSlug=initech-prod');

    await expect(list.chips()).toHaveCount(2);
    // The chips wrap under the search: they do not push the controls beside them
    // past the edge of the page, where it would clip them with nothing to scroll.
    await expectOnScreen(
      page,
      page.getByRole('button', { exact: true, name: 'Filter' }),
    );
    await expectOnScreen(page, list.exportButton());
  });
});

test.describe('the paging of the list', () => {
  test('reads every invoice, 200 at a time, then pages them ten to a page in the browser, newest first', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const reads = recordWrites(page, /\/api\/invoices$/, ['GET']);
    await installBillingAppMocks(page, createManyInvoicesModel());

    await list.goto();

    await expect(list.rows()).toHaveCount(10);
    // The newest is first, whatever the page the API sent it on.
    expect((await list.invoiceIds())[0]).toBe('inv-bulk-60');
    expect(reads).toHaveLength(1);
    expect(new URLSearchParams(reads[0].search).get('limit')).toBe('200');
    expect(new URLSearchParams(reads[0].search).has('cursor')).toBe(false);
    await expect(page.getByText('Showing 1-10 of 60 records')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Load more', exact: true }),
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await expect(page.getByText('Showing 11-20 of 60 records')).toBeVisible();
    expect((await list.invoiceIds())[0]).toBe('inv-bulk-50');
    // Nothing more was asked of the API: the pages are the browser's.
    expect(reads).toHaveLength(1);
  });

  test('keeps every page of a list longer than the one the API sends', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const reads = recordWrites(page, /\/api\/invoices$/, ['GET']);
    await installBillingAppMocks(page, createManyInvoicesModel(230));

    await list.goto();

    // 230 invoices: the API sends 200 and says there are more, the console asks for
    // the rest with the cursor it was given.
    await expect(page.getByText('Showing 1-10 of 230 records')).toBeVisible();
    expect(reads).toHaveLength(2);
    expect(new URLSearchParams(reads[0].search).has('cursor')).toBe(false);
    expect(new URLSearchParams(reads[1].search).get('cursor')).toBeTruthy();
    expect(new URLSearchParams(reads[1].search).get('limit')).toBe('200');
  });

  test('shows the invoices of the organization in one page when they fit it', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.goto();

    await expect(list.rows()).toHaveCount(10);
    await expect(page.getByText('Showing 1-10 of 11 records')).toBeVisible();
    await list.showRowsPerPage(20);
    await expect(list.rows()).toHaveCount(11);
  });
});

test.describe('the states of the list', () => {
  test('says there is nothing yet, and where an invoice comes from', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createEmptyInvoicesModel());

    await list.gotoShowingEverything();

    await expect(list.empty()).toContainText('No invoices yet');
    await expect(
      list.empty().getByRole('link', { name: 'Go to instances' }),
    ).toHaveAttribute('href', '/customers/instances');
    await expect(
      list.empty().getByRole('button', { name: 'Clear filters' }),
    ).toHaveCount(0);
  });

  test('says nothing was invoiced for a customer, and leads to every invoice', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything('?customerSlug=nobody');

    await expect(list.empty()).toContainText('No invoice for this customer');
    await list
      .empty()
      .getByRole('button', { name: 'Show every invoice' })
      .click();

    await expect.poll(() => list.pathAndSearch()).toBe('/billing/invoices');
    await expect(list.rows()).toHaveCount(10);
    await expect(page.getByText('Showing 1-10 of 11 records')).toBeVisible();
  });

  test('says the same of an instance', async ({ page }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything('?instanceSlug=nobody');

    await expect(list.empty()).toContainText('No invoice for this instance');
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

    await list.gotoRefused();

    await expect(list.error()).toContainText(
      'the invoice store is unavailable',
    );
    await expect(list.error()).toContainText('Reference trace-list-1');
    // The console around it still works.
    await expect(
      page.getByRole('link', { name: 'Handoff', exact: true }),
    ).toBeVisible();

    await list.error().getByRole('button', { name: 'Retry' }).click();

    await expect(list.rows()).toHaveCount(10);
    await expect(page.getByText('Showing 1-10 of 11 records')).toBeVisible();
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

    await list.gotoRefused();

    await expect(list.error()).toContainText('read:billing');
    await expect(list.error()).toContainText('token template');
    await expect(
      list.error().getByRole('button', { name: 'Retry' }),
    ).toHaveCount(0);
  });

  test('shows why when a page of the walk is refused, and reads the whole list again when asked', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const model = createManyInvoicesModel(230);
    model.invoices.armProblem('listInvoices', {
      after: 1,
      detail: 'the invoice store is unavailable',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await list.gotoRefused();

    // The first page was read and the second was refused: nothing partial is shown.
    await expect(list.error()).toContainText(
      'the invoice store is unavailable',
    );
    await expect(list.rows()).toHaveCount(0);

    await list.error().getByRole('button', { name: 'Retry' }).click();

    await expect(page.getByText('Showing 1-10 of 230 records')).toBeVisible();
    await expect(list.error()).toHaveCount(0);
  });
});

test.describe('the export of the list', () => {
  test('offers three files, and sends the scope and the filters of the screen with the shape each one is', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const exports = recordWrites(page, /\/api\/invoices\/export$/, ['GET']);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything('?customerSlug=initech');
    await list.addFilter('Status');
    await list.pick('Ready to bill');
    await list.closeEditor();
    await list.addFilter('Kind');
    await list.pick('Activation');
    await list.expectInvoiceIds(['inv-m1', 'inv-r1']);

    // Every filter of the screen has its twin in the API: nothing is left out.
    await list.openExportMenu();
    await expect(list.exportNote()).toHaveCount(0);
    await page.keyboard.press('Escape');

    // A CSV with a row for every line of the invoices selected.
    const lines = await list.export('CSV by invoice line');
    expect(lines.suggestedFilename()).toMatch(
      /^invoices-by-line-\d{8}T\d{6}Z\.csv$/,
    );
    const linesQuery = new URLSearchParams(exports[0].search);
    expect(linesQuery.get('customerSlug')).toBe('initech');
    expect(linesQuery.getAll('status')).toEqual(['MANUAL']);
    expect(linesQuery.get('kind')).toBe('ACTIVATION');
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
    // Only what the filters select: this one is a renewal.
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

  test('says which filter the file leaves out, and hands over what the API selects', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const exports = recordWrites(page, /\/api\/invoices\/export$/, ['GET']);
    await installBillingAppMocks(page, createInvoicesModel());

    await list.gotoShowingEverything();
    await list.addFilter('Status');
    await list.pick('Paid');
    await list.closeEditor();
    // The search is the screen's alone: the API has no search to send it to.
    await list.search('globex');
    await list.expectInvoiceIds(['inv-d2']);

    await list.openExportMenu();

    await expect(list.exportNote()).toHaveText(
      'This filter is not applied to the file: Search.',
    );
    await page
      .getByRole('menuitem', { exact: true, name: 'CSV by invoice' })
      .click();
    await expect.poll(() => exports.length).toBe(1);
    const query = new URLSearchParams(exports[0].search);
    expect(query.getAll('status')).toEqual(['PAID']);
    expect(query.has('query')).toBe(false);
    expect(query.has('search')).toBe(false);
  });

  test('leaves overdue out of the file and says so, since the API counts more invoices overdue than the screen', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    const exports = recordWrites(page, /\/api\/invoices\/export$/, ['GET']);
    // `inv-s1`, which Stripe charges by card, is past its due date: the API counts
    // it overdue, as it does any issued invoice that is unpaid past its due date,
    // and the screen does not, since it says it only of an invoice sent to the
    // customer. The file would hold what the screen does not show.
    await installBillingAppMocks(page, createInvoicesModel({ stripe: true }));

    await list.gotoShowingEverything();
    await list.addFilter('Overdue');
    await list.pick('True');
    await list.expectInvoiceIds(['inv-m1', 'inv-r1']);

    await list.openExportMenu();

    await expect(list.exportNote()).toHaveText(
      'This filter is not applied to the file: Overdue.',
    );
    await page
      .getByRole('menuitem', { exact: true, name: 'CSV by invoice' })
      .click();
    await expect.poll(() => exports.length).toBe(1);
    expect(new URLSearchParams(exports[0].search).has('overdue')).toBe(false);
  });

  test('exports every invoice the filters select, not only the page that was read', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createManyInvoicesModel());

    await list.gotoShowingEverything();
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

    await list.gotoShowingEverything();
    await list.openExportMenu();
    await page
      .getByRole('menuitem', { name: 'CSV by invoice', exact: true })
      .click();

    await expectErrorToast(page, 'granularity is line or invoice');
    await expect(list.rows()).toHaveCount(11);
    await expect(list.exportButton()).toBeEnabled();
  });
});
