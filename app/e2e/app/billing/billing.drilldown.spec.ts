import { readFile } from 'node:fs/promises';
import { expect, recordWrites, test } from '../_support/app-test';
import { expectErrorToast } from '../_support/assertions/toast';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { LineDrilldownDriver } from '../_support/drivers/line-drilldown.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import {
  createInvoicesModel,
  createManyReportsModel,
} from './billing.scenarios';

// The usage a metered line was measured from, report by report, so that a figure
// on an invoice can be checked against what the instance reported: grouped by the
// window it counted in, with the limit that applied to each report.

const INVOICE = 'inv-p1';
const LINE = 'inv-p1-line-1';
const TITLE = 'Traces overage';

test.describe('the reports behind a line', () => {
  test('are reached from the invoice, and the trail names each level of the way', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const drilldown = new LineDrilldownDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto(INVOICE);
    await invoice.reportsLink(TITLE).click();

    await expect(page).toHaveURL(
      new RegExp(`/billing/invoices/${INVOICE}/lines/${LINE}$`),
    );
    await expect(
      page.getByRole('heading', { level: 1, name: TITLE }),
    ).toBeVisible();
    await expect(drilldown.breadcrumbs()).toContainText('Billing');
    await expect(drilldown.breadcrumbs()).toContainText('Invoices');
    await expect(drilldown.breadcrumbs()).toContainText(
      'Renewal invoice, Apr 1, 2026 (UTC)',
    );
    await expect(drilldown.breadcrumbs()).toContainText('Lines');
    await expect(drilldown.breadcrumbs()).toContainText(TITLE);
  });

  test('say what the line came to before the reports behind it', async ({
    page,
  }) => {
    const drilldown = new LineDrilldownDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await drilldown.goto(INVOICE, LINE, TITLE);

    await expect(
      page.getByText('Overage', { exact: true }).first(),
    ).toBeVisible();
    await expect(drilldown.measuredQuantity()).toHaveText('52,345');
    // One sale unit is a hundred thousand: the quantity billed is 0.52345.
    await expect(drilldown.billedQuantity()).toHaveText('0.52345');
    await expect(drilldown.summary()).toContainText('100,000');
    await expect(drilldown.summary()).toContainText(
      'Mar 1 – Apr 1, 2026 (UTC)',
    );
    await expect(drilldown.summary()).toContainText('1 window');
    await expect(drilldown.summary()).toContainText('$4.19');
    await expect(drilldown.fingerprint()).toHaveText(
      'Reports 41–45 · 5 rows · Σ 172,345',
    );
  });

  test('are listed in the order they were accepted, with the overage each one moved', async ({
    page,
  }) => {
    const drilldown = new LineDrilldownDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await drilldown.goto(INVOICE, LINE, TITLE);

    await expect(drilldown.windows()).toHaveCount(1);
    expect(await drilldown.reportNumbers()).toEqual([
      '41',
      '42',
      '43',
      '44',
      '45',
    ]);
    await expect(drilldown.cell(41, 'Overage change')).toHaveText('0');
    await expect(drilldown.cell(42, 'Overage change')).toHaveText('10,000');
    await expect(drilldown.cell(43, 'Overage change')).toHaveText('20,000');
    await expect(drilldown.cell(44, 'Overage change')).toHaveText('0');
    await expect(drilldown.cell(45, 'Overage change')).toHaveText('22,345');
    // Each report with the counter before and after it, and the time it was accepted.
    await expect(drilldown.cell(42, 'Counter')).toHaveText('60,000 → 110,000');
    await expect(drilldown.cell(42, 'Change')).toHaveText('50,000');
    await expect(drilldown.cell(42, 'Reported at')).toHaveText(
      'Mar 6, 2026, 2:30 PM (UTC)',
    );
    // How the report moved the counter, in the words of the language.
    await expect(drilldown.cell(42, 'Behavior')).toHaveText('Append');
    await expect(drilldown.cell(42, 'Transaction')).toHaveText('tx-42');
  });

  test('are grouped by the window they counted in, with the sum next to the quantity', async ({
    page,
  }) => {
    const drilldown = new LineDrilldownDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await drilldown.goto(INVOICE, LINE, TITLE);

    await expect(drilldown.windowTitle(0)).toHaveText(
      'Mar 1 – Apr 1, 2026 (UTC)',
    );
    // 10,000 + 20,000 + 22,345: the quantity of the line, in measured units.
    await expect(drilldown.windowSum(0)).toHaveText(
      '5 reports · overage 52,345',
    );
    await expect(drilldown.measuredQuantity()).toHaveText('52,345');
    await expect(drilldown.reportRows()).toHaveCount(5);
  });

  test('mark the report where the limit in force changed, which explains the overage', async ({
    page,
  }) => {
    const drilldown = new LineDrilldownDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await drilldown.goto(INVOICE, LINE, TITLE);

    // The boost raised the limit at report 44, and only there.
    await expect(drilldown.limitChanges()).toHaveCount(1);
    await expect(drilldown.cell(44, 'Limit')).toContainText('Limit changed');
    await expect(drilldown.cell(44, 'Limit')).toContainText('150,000');
    await expect(drilldown.cell(43, 'Limit')).toHaveText('100,000');
    await expect(drilldown.cell(45, 'Limit')).toHaveText('150,000');
  });

  test('show what a report was sent with, for the ones that were sent with something', async ({
    page,
  }) => {
    const drilldown = new LineDrilldownDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await drilldown.goto(INVOICE, LINE, TITLE);

    // One report has properties, the others have none to show.
    await expect(
      page.getByRole('button', { name: /^Show the properties of report/ }),
    ).toHaveCount(1);
    await page
      .getByRole('button', { name: 'Show the properties of report 41' })
      .click();
    await expect(page.getByRole('dialog')).toContainText(
      '"region": "eu-west-1"',
    );
    await expect(page.getByRole('dialog')).toContainText('"source": "otel"');
  });

  test('can be saved as a CSV, all of them, under a name of their own', async ({
    page,
  }) => {
    const drilldown = new LineDrilldownDriver(page);
    const reads = recordWrites(page, /\/reports$/, ['GET']);
    await installBillingAppMocks(page, createInvoicesModel());

    await drilldown.goto(INVOICE, LINE, TITLE);
    const file = await drilldown.exportCsv();

    expect(file.suggestedFilename()).toBe(
      'invoice-inv-p1-line-1-usage-reports.csv',
    );
    expect(reads.at(-1)?.pathname).toBe(
      `/api/invoices/${INVOICE}/lines/${LINE}/reports`,
    );
    expect(new URLSearchParams(reads.at(-1)?.search).get('format')).toBe('csv');
    const csv = (await readFile((await file.path()) ?? '', 'utf8'))
      .trim()
      .split('\n');
    // A header, and a row for each of the five reports.
    expect(csv).toHaveLength(6);
    expect(csv[0]).toContain('report_seq');
  });

  test('lead back to the invoice they are of', async ({ page }) => {
    const drilldown = new LineDrilldownDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await drilldown.goto(INVOICE, LINE, TITLE);
    await drilldown.backToInvoice().click();

    await expect(page).toHaveURL(new RegExp(`/billing/invoices/${INVOICE}$`));
    await expect(
      page.getByRole('heading', { level: 1, name: /^Renewal invoice/ }),
    ).toBeVisible();
  });

  test('are a page that does not exist for a line that was not measured, or one the invoice does not have', async ({
    page,
  }) => {
    await installBillingAppMocks(page, createInvoicesModel());

    // A base fee has no usage.
    await page.goto(`/billing/invoices/${INVOICE}/lines/${INVOICE}-line-2`);
    await expect(page.getByText('Page not found')).toBeVisible();

    await page.goto(`/billing/invoices/${INVOICE}/lines/inv-p1-line-9`);
    await expect(page.getByText('Page not found')).toBeVisible();
  });
});

test.describe('a line with more reports than a page holds', () => {
  test('is read 500 at a time, and a window is whole only once the page that ends it is read', async ({
    page,
  }) => {
    const drilldown = new LineDrilldownDriver(page);
    const reads = recordWrites(page, /\/reports$/, ['GET']);
    await installBillingAppMocks(page, createManyReportsModel());

    await drilldown.goto('inv-big', 'inv-big-line-1', 'Events');

    await expect(drilldown.reportRows()).toHaveCount(500);
    await expect(drilldown.reportRows()).toHaveCount(500);
    // The page ends inside March: its sum is not given yet.
    await expect(drilldown.windowSum(0)).toHaveText(
      '500 reports so far · more to load',
    );
    expect(new URLSearchParams(reads[0].search).get('limit')).toBe('500');
    expect(new URLSearchParams(reads[0].search).get('afterSeq')).toBe('0');

    await drilldown.loadMore().click();

    await expect(drilldown.reportRows()).toHaveCount(520);
    await expect(drilldown.reportRows()).toHaveCount(520);
    await expect(drilldown.loadMore()).toHaveCount(0);
    // The next page continues after the last report read.
    expect(new URLSearchParams(reads[1].search).get('afterSeq')).toBe('500');
    // Two windows now, each whole, each floored at zero as the invoice floors them.
    await expect(drilldown.windows()).toHaveCount(2);
    await expect(drilldown.windowSum(0)).toHaveText('505 reports · usage 505');
    await expect(drilldown.windowSum(1)).toHaveText('15 reports · usage 30');
    await expect(drilldown.windowTitle(0)).toHaveText(
      'Mar 1 – Apr 1, 2026 (UTC)',
    );
    await expect(drilldown.windowTitle(1)).toHaveText(
      'Apr 1 – May 1, 2026 (UTC)',
    );
    // And the invoice says it spans two windows.
    await expect(drilldown.summary()).toContainText('2 windows');
  });
});

test.describe('reports that are no longer kept', () => {
  test('give way to what the invoice kept of them: the fingerprint of the reports', async ({
    page,
  }) => {
    const drilldown = new LineDrilldownDriver(page);
    // The usage before April 1 is purged: the period of this line starts on March 1.
    await installBillingAppMocks(
      page,
      createInvoicesModel({ retentionStart: '2026-04-01T00:00:00.000Z' }),
    );

    await drilldown.goto(INVOICE, LINE, TITLE);

    await expect(drilldown.outsideRetention()).toContainText(
      'The reports of this line are no longer kept',
    );
    await expect(
      drilldown.outsideRetention().getByTestId('line-fingerprint'),
    ).toHaveText('Reports 41–45 · 5 rows · Σ 172,345');
    await expect(drilldown.windows()).toHaveCount(0);
    // The line is still there, and the way back, but not an export that would fail.
    await expect(drilldown.summary()).toBeVisible();
    await expect(drilldown.backToInvoice()).toBeVisible();
    await expect(drilldown.exportButton()).toHaveCount(0);
    await expect(drilldown.skeleton()).toHaveCount(0);
  });

  test('do so for an old draft as well, whose usage is spared but whose period is as old', async ({
    page,
  }) => {
    const drilldown = new LineDrilldownDriver(page);
    await installBillingAppMocks(
      page,
      createInvoicesModel({ retentionStart: '2026-04-01T00:00:00.000Z' }),
    );

    await drilldown.goto('inv-h1', 'inv-h1-line-1', TITLE);

    await expect(drilldown.outsideRetention()).toBeVisible();
    await expect(
      drilldown.outsideRetention().getByTestId('line-fingerprint'),
    ).toHaveText('Reports 41–45 · 5 rows · Σ 172,345');
  });
});

test.describe('the reports when the API refuses them', () => {
  test('show why, with the trace of a failure that is the server’s, and read again when asked', async ({
    page,
  }) => {
    const drilldown = new LineDrilldownDriver(page);
    const model = createInvoicesModel();
    model.invoices.armProblem('listLineReports', {
      detail: 'the usage journal is unavailable',
      errorId: 'trace-reports-1',
      status: 500,
    });
    await installBillingAppMocks(page, model);

    await drilldown.goto(INVOICE, LINE, TITLE);

    await expect(drilldown.error()).toContainText(
      'the usage journal is unavailable',
    );
    await expect(drilldown.error()).toContainText('Reference trace-reports-1');
    // The line itself is still there to read.
    await expect(drilldown.summary()).toBeVisible();

    await drilldown.error().getByRole('button', { name: 'Retry' }).click();

    await expect(drilldown.windows()).toHaveCount(1);
    await expect(drilldown.error()).toHaveCount(0);
  });

  test('name the scope a session lacks', async ({ page }) => {
    const drilldown = new LineDrilldownDriver(page);
    const model = createInvoicesModel();
    model.invoices.armProblem('listLineReports', {
      code: 'Auth.MissingScope',
      detail: 'missing required scope: read:billing',
      status: 403,
    });
    await installBillingAppMocks(page, model);

    await drilldown.goto(INVOICE, LINE, TITLE);

    await expect(drilldown.error()).toContainText('read:billing');
    await expect(
      drilldown.error().getByRole('button', { name: 'Retry' }),
    ).toHaveCount(0);
  });

  test('show a failed export without changing the page', async ({ page }) => {
    const drilldown = new LineDrilldownDriver(page);
    const model = createInvoicesModel();
    // The page read its reports once; the export is the second call.
    model.invoices.armProblem('listLineReports', {
      after: 1,
      code: 'ListInvoiceLineReports.InvalidFormat',
      detail: 'the export is not available',
      status: 422,
    });
    await installBillingAppMocks(page, model);

    await drilldown.goto(INVOICE, LINE, TITLE);
    await drilldown.exportButton().click();

    await expectErrorToast(page, 'the export is not available');
    await expect(drilldown.windows()).toHaveCount(1);
    await expect(drilldown.exportButton()).toBeEnabled();
  });
});
