import { expect, test } from '../_support/app-test';
import { BillingInvoicesDriver } from '../_support/drivers/billing-invoices.driver';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import {
  createInvoicesModel,
  createManyReportsModel,
  createMismatchedTotalsModel,
} from './billing.scenarios';

// One invoice, as the API composed it: what it bills line by line, in what
// status, for whom, and where it stands. Nothing on the page is added up or
// worked out by the console, and an invoice that was voided or replaced points
// to the other.

test.describe('an invoice', () => {
  test('is titled by its kind and the boundary it bills, with its status and who collects it', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');

    await expect(invoice.title()).toHaveText(
      'Renewal invoice, Apr 1, 2026 (UTC)',
    );
    await expect(invoice.statusBadge()).toHaveText('Ready to bill');
    await expect(invoice.providerBadge()).toHaveText('Manual');
    await expect(page.getByText('Initech · Initech Production')).toBeVisible();
    // The trail names the invoice, and the invoices above it.
    await expect(
      page.getByRole('navigation', { name: 'breadcrumb' }),
    ).toContainText('Renewal invoice, Apr 1, 2026 (UTC)');
  });

  test('lists its lines in the order the API composed them, each with its period and its amount', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');

    await expect(invoice.lines()).toHaveCount(3);
    const [overage, base, discount] = await invoice.lines().all();
    await expect(overage).toContainText('Traces overage');
    await expect(overage).toContainText('Overage');
    await expect(overage).toContainText('Mar 1 – Apr 1, 2026 (UTC)');
    await expect(overage).toContainText('$4.19');
    await expect(base).toContainText('Pro, monthly');
    await expect(base).toContainText('Base');
    await expect(base).toContainText('Apr 1 – May 1, 2026 (UTC)');
    await expect(base).toContainText('$29.00');
    await expect(discount).toContainText('Welcome −20%');
    await expect(discount).toContainText('Discount');
    await expect(discount).toContainText('−$5.80');
  });

  test('says the arithmetic of a line in the API’s own words', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');

    await expect(invoice.line('Traces overage')).toContainText(
      '0.52345 × $8.00 per 100k traces',
    );
    await expect(invoice.line('Welcome −20%')).toContainText('20% of $29.00');
  });

  test('shows the totals as the API states them: the subtotal, the discount and what the invoice comes to', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');

    const totals = invoice.totals().getByTestId('invoice-totals');
    await expect(totals).toContainText('Subtotal');
    await expect(totals).toContainText('$33.19');
    await expect(totals).toContainText('Discounts');
    await expect(totals).toContainText('−$5.80');
    await expect(totals).toContainText('Total');
    await expect(totals).toContainText('$27.39');
  });

  test('never works a total out: those of the API are shown even when they disagree with the lines', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createMismatchedTotalsModel());

    await invoice.goto('inv-odd');

    // The lines add up to $43.19, which is nowhere on the page.
    const totals = invoice.totals().getByTestId('invoice-totals');
    await expect(totals).toContainText('$49.00');
    await expect(totals).toContainText('−$5.80');
    await expect(totals).toContainText('$43.20');
    await expect(page.getByText('$43.19')).toHaveCount(0);
  });

  test('says for a line that was measured the limits that applied, and what it was measured from', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');

    await expect(invoice.overageLimits('Traces overage')).toContainText(
      'Usage 172,345, of which 52,345 above the limit',
    );
    // The limit changed with a boost: both are listed, in the order they applied.
    const limits = invoice
      .overageLimits('Traces overage')
      .getByRole('listitem');
    await expect(limits).toHaveText([
      'Limit 100,000 (+100% accepted) · 3 reports',
      'Limit 150,000 (+100% accepted) · 2 reports',
    ]);
    await expect(invoice.fingerprint('Traces overage')).toHaveText(
      'Reports 41–45 · 5 rows · Σ 172,345',
    );
  });

  test('says each kind of line by its type, whatever price members it has or has not', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createMismatchedTotalsModel());

    await invoice.goto('inv-odd');

    // A base fee, an add-on and a discount: no licence price on the add-on, no unit
    // amount on the discount, and nothing was measured for any of them.
    await expect(invoice.line('Pro, monthly')).toContainText('Base');
    await expect(invoice.line('Support add-on')).toContainText('Add-on');
    await expect(invoice.line('Welcome discount')).toContainText('Discount');
    await expect(invoice.line('Welcome discount')).toContainText('−$5.81');
    await expect(
      invoice.line('Support add-on').getByTestId('line-fingerprint'),
    ).toHaveCount(0);
  });

  test('says what a usage line was measured from, without the arithmetic of an overage', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createManyReportsModel());

    await invoice.goto('inv-big');

    await expect(invoice.line('Events')).toContainText('Usage');
    await expect(invoice.fingerprint('Events')).toHaveText(
      'Reports 1–520 · 520 rows · Σ 535',
    );
    await expect(invoice.reportsLink('Events')).toHaveText(
      'View 520 usage reports',
    );
    await expect(invoice.overageLimits('Events')).toHaveCount(0);
  });

  test('leads from a measured line to its reports, and from no other', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');

    await expect(invoice.reportsLink('Traces overage')).toHaveText(
      'View 5 usage reports',
    );
    await expect(invoice.reportsLink('Traces overage')).toHaveAttribute(
      'href',
      '/billing/invoices/inv-p1/lines/inv-p1-line-1',
    );
    // A base fee and a discount were not measured from anything.
    await expect(invoice.reportsLink('Pro, monthly')).toHaveCount(0);
    await expect(invoice.reportsLink('Welcome −20%')).toHaveCount(0);
    await expect(invoice.fingerprint('Pro, monthly')).toHaveCount(0);
  });

  test('says when it was issued, when it is due and how long after it was issued', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');

    await expect(invoice.summary()).toContainText('Renewal');
    await expect(invoice.summary()).toContainText(
      'Apr 1, 2026, 12:00 AM (UTC)',
    );
    await expect(invoice.summary()).toContainText(
      'Apr 1, 2026, 12:04 AM (UTC)',
    );
    await expect(invoice.summary()).toContainText('14 days to pay');
    await expect(invoice.summary()).toContainText('Manual');
  });

  test('says how it ended: paid, written off, voided with the reason', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-d1');
    await expect(invoice.statusBadge()).toHaveText('Paid');
    await expect(invoice.summary()).toContainText(
      'Feb 10, 2026, 10:00 AM (UTC)',
    );

    await invoice.goto('inv-u1');
    await expect(invoice.statusBadge()).toHaveText('Written off');
    await expect(invoice.summary()).toContainText(
      'Jan 20, 2026, 9:00 AM (UTC)',
    );

    await invoice.goto('inv-v2');
    await expect(invoice.statusBadge()).toHaveText('Void');
    await expect(invoice.summary()).toContainText('duplicate');
  });

  test('shows who it was composed for as it was then, even once the instance was deleted', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    // `globex-prod` was deleted since: the invoice outlives it.
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-g1');

    await expect(invoice.identity()).toContainText('Globex');
    await expect(invoice.identity()).toContainText('globex');
    await expect(invoice.identity()).toContainText('Globex Production');
    await expect(invoice.identity()).toContainText('globex-prod');
    await expect(invoice.identity()).toContainText('pro-v2');
    await expect(invoice.identity()).toContainText('ap@initech.test');
  });

  test('leads to the other invoices of the same customer and of the same instance', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-g1');
    await invoice
      .identity()
      .getByRole('link', { name: 'Invoices of this customer' })
      .click();

    await expect(page).toHaveURL(/\/billing\/invoices\?customerSlug=globex$/);
    await expect(page.getByText('Customer: globex')).toBeVisible();
    await expect(new BillingInvoicesDriver(page).rows()).toHaveCount(3);
  });

  test('is a page that does not exist for an invoice the API does not know', async ({
    page,
  }) => {
    await installBillingAppMocks(page, createInvoicesModel());

    await page.goto('/billing/invoices/inv-nope');

    await expect(page.getByText('Page not found')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Back to Billing' }),
    ).toBeVisible();
  });
});

test.describe('a held draft', () => {
  test('says in words why it is held, and lists the meters that failed', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-h1');

    await expect(invoice.holdBanner()).toContainText(
      'Held: Usage reports are missing from the journal',
    );
    await expect(invoice.holdBanner()).toHaveAttribute(
      'data-hold-reason',
      'LEDGER_SEQUENCE_GAP',
    );
    // The pair names its meter by the slug the line carries, not by its id.
    const row = invoice.holdBanner().getByRole('row').nth(1);
    await expect(row).toContainText('traces');
    await expect(row).toContainText(
      'Usage reports are missing from the journal',
    );
    await expect(row).toContainText('42');
    await expect(row).toContainText('43');
    await expect(row).toContainText('41–45');
    await expect(invoice.statusBadge()).toHaveText('Held');
  });

  test('says what each way out does, under the provider of the invoice', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-h1');

    await expect(invoice.holdBanner()).toContainText(
      'Releasing accepts the amounts as composed. The invoice is issued with no payment provider and waits in the handoff queue for your ERP.',
    );
    await expect(invoice.holdBanner()).toContainText(
      'Recomposing composes the invoice again from the usage journal as it is now',
    );
  });

  test('lists every meter of a journal that failed on more than one, each with its own check', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-h2');

    await expect(invoice.holdBanner().getByRole('row')).toHaveCount(3);
    await expect(invoice.holdBanner()).toContainText(
      'The usage journal chain is broken',
    );
    await expect(invoice.holdBanner()).toContainText(
      'The usage counter does not match the journal',
    );
  });

  test('offers no way to be marked paid: nothing was issued', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-h1');

    await expect(invoice.action('Mark as paid')).toHaveCount(0);
  });
});

test.describe('the chain of replacements', () => {
  test('leads from a void invoice to its replacement, and back', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-v1');
    await expect(invoice.chain()).toContainText('Replaced by');
    await invoice.chain().getByRole('link', { name: 'inv-r1' }).click();

    await expect(page).toHaveURL(/\/billing\/invoices\/inv-r1$/);
    await expect(invoice.title()).toBeVisible();
    await expect(invoice.chain()).toContainText('Replaces');

    await invoice.chain().getByRole('link', { name: 'inv-v1' }).click();

    await expect(page).toHaveURL(/\/billing\/invoices\/inv-v1$/);
    await expect(invoice.statusBadge()).toHaveText('Void');
  });

  test('is absent from an invoice that replaces nothing and was replaced by nothing', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-m1');

    await expect(invoice.chain()).toHaveCount(0);
  });
});

test.describe('where an invoice stands in the handoff queue', () => {
  test('says it waits for the accounting system, how many times it was taken and until when one holds it', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');

    await expect(invoice.handoff()).toContainText('Waiting for your ERP');
    await expect(invoice.handoff()).toContainText('Claims');
    await expect(invoice.handoff()).toContainText('2');
    // A consumer took it a quarter of an hour ago and holds it still.
    await expect(invoice.handoff()).toContainText('Reserved until');
  });

  test('does not say a lease that ran out holds the invoice', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-m1');

    await expect(invoice.handoff()).toContainText('Waiting for your ERP');
    await expect(invoice.handoff()).not.toContainText('Reserved until');
  });

  test('shows the number the accounting system booked it under', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-d1');

    await expect(invoice.handoff()).toContainText('Acknowledged');
    await expect(invoice.handoff()).toContainText('ERP-1001');
    await expect(invoice.handoff()).toContainText('Feb 3, 2026, 9:00 AM (UTC)');
  });

  test('says it was acknowledged without a number when it was', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-u1');

    await expect(invoice.handoff()).toContainText(
      'Acknowledged without a reference',
    );
  });

  test('is absent from a held draft, which was not issued', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-h1');

    await expect(invoice.handoff()).toHaveCount(0);
  });
});
