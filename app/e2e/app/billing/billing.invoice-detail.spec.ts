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
// status, for whom, and where it stands. No amount on the page is added up by the
// console (the one thing it works out is a date: how far the due day is), and an
// invoice that was voided or replaced points to the other.

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

  test('says which boundary it was composed at, when it was issued and on which terms', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');

    await expect(invoice.summary()).toContainText(
      'Apr 1, 2026, 12:00 AM (UTC)',
    );
    await expect(invoice.summary()).toContainText(
      'Apr 1, 2026, 12:04 AM (UTC)',
    );
    await expect(invoice.summary()).toContainText('Payment terms');
    await expect(invoice.summary()).toContainText('14 days');
    await expect(invoice.summary()).toContainText('Manual');
    // What the strip says is not said twice: not the due date, nor the period.
    await expect(invoice.summary()).not.toContainText('Due');
    await expect(invoice.summary()).not.toContainText('Service period');
  });

  test('says why a void invoice was voided, and not when: the strip says when', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-v2');

    await expect(invoice.statusBadge()).toHaveText('Void');
    await expect(invoice.summary()).toContainText('Void reason');
    await expect(invoice.summary()).toContainText('duplicate');
    await expect(invoice.summary()).not.toContainText('Oct 5, 2025');
  });

  test('keeps the day an invoice that ended had fallen due, which its strip no longer states', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    // Issued on February 1 on terms of thirty days.
    await invoice.goto('inv-d1');
    await expect(invoice.summary()).toContainText('Due');
    await expect(invoice.summary()).toContainText('Mar 3, 2026 (UTC)');
    // When it was paid is the strip's, and is not said twice.
    await expect(invoice.summary()).not.toContainText('Feb 10, 2026');

    await invoice.goto('inv-v2');
    await expect(invoice.summary()).toContainText('Oct 31, 2025 (UTC)');
  });

  test('says since when a draft is held, and not when an invoice that was issued was', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-h1');
    await expect(invoice.summary()).toContainText('Held since');
    await expect(invoice.summary()).toContainText(
      'May 1, 2026, 12:00 AM (UTC)',
    );
    await expect(invoice.summary()).not.toContainText('Issued');

    await invoice.goto('inv-p1');
    await expect(invoice.summary()).not.toContainText('Held since');
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

test.describe('the figures under the header', () => {
  test('are the total, the due date and the service period, in a row of three', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');

    await expect(
      invoice.stats().locator('[data-slot="stat-card"]'),
    ).toHaveCount(3);
    // The total as the API states it, and how many lines it comes from.
    await expect(invoice.stat('Total')).toContainText('$27.39');
    await expect(invoice.stat('Total')).toContainText('3 lines');
    // The span of its lines, in UTC, under the kind of invoice it is.
    await expect(invoice.stat('Service period')).toContainText(
      /Mar 1 – May 1, 2026\s*\(UTC\)/,
    );
    await expect(invoice.stat('Service period')).toContainText('Renewal');
    // Due after today, and how many days after.
    await expect(invoice.stat('Due')).toContainText('in 20 days');
  });

  test('sit between the header and the cards, and stay under the header', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');

    const title = await invoice.title().boundingBox();
    const figure = await invoice.stat('Total').boundingBox();
    const summary = await invoice.summary().boundingBox();
    expect(figure?.y).toBeGreaterThan((title?.y ?? 0) + (title?.height ?? 0));
    expect(summary?.y).toBeGreaterThan(
      (figure?.y ?? 0) + (figure?.height ?? 0),
    );
  });

  test('say in danger how long an invoice has been overdue', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-m1');

    await expect(invoice.statusBadge()).toHaveText('Overdue');
    await expect(invoice.stat('Due')).toContainText(/Mar 31, 2026\s*\(UTC\)/);
    await expect(invoice.stat('Due')).toContainText(/overdue for \d+ days/);
    await expect(
      invoice.stat('Due').locator('[data-slot="stat-card-helper"]'),
    ).toHaveClass(/text-destructive-subtle-foreground/);
  });

  test('say a draft was not issued, and have no due date to show', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-h1');

    await expect(invoice.stat('Due')).toContainText('Not issued');
    await expect(
      invoice.stat('Due').locator('[data-slot="stat-card-helper"]'),
    ).toHaveCount(0);
  });

  test('say when an invoice that ended did, instead of when it was due', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-d1');
    await expect(invoice.statusBadge()).toHaveText('Paid');
    await expect(invoice.stat('Paid')).toContainText(/Feb 10, 2026\s*\(UTC\)/);
    await expect(invoice.stat('Paid')).toContainText('10:00 AM (UTC)');
    await expect(invoice.stat('Due')).toHaveCount(0);

    await invoice.goto('inv-u1');
    await expect(invoice.statusBadge()).toHaveText('Written off');
    await expect(invoice.stat('Written off')).toContainText(
      /Jan 20, 2026\s*\(UTC\)/,
    );
    await expect(invoice.stat('Written off')).toContainText('9:00 AM (UTC)');

    await invoice.goto('inv-v2');
    await expect(invoice.statusBadge()).toHaveText('Void');
    await expect(invoice.stat('Voided')).toContainText(/Oct 5, 2025\s*\(UTC\)/);
    await expect(invoice.stat('Voided')).toContainText('9:00 AM (UTC)');
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
  test('leads from a void invoice to its replacement, and back, by rows of its summary', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-v1');
    await expect(invoice.summary()).toContainText('Replaced by');
    await expect(invoice.replaces()).toHaveCount(0);
    await invoice.replacedBy().click();

    await expect(page).toHaveURL(/\/billing\/invoices\/inv-r1$/);
    await expect(invoice.title()).toBeVisible();
    await expect(invoice.summary()).toContainText('Replaces');
    await expect(invoice.replaces()).toHaveText('inv-v1');

    await invoice.replaces().click();

    await expect(page).toHaveURL(/\/billing\/invoices\/inv-v1$/);
    await expect(invoice.statusBadge()).toHaveText('Void');
  });

  test('is no banner of its own: nothing stands between the strip and the cards', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-r1');

    await expect(page.getByTestId('invoice-chain')).toHaveCount(0);
    const strip = await invoice.stats().boundingBox();
    const summary = await invoice.summary().boundingBox();
    expect(strip).not.toBeNull();
    expect(summary).not.toBeNull();
    // The cards start right under the strip, with no row of a banner between.
    expect(
      (summary?.y ?? 0) - ((strip?.y ?? 0) + (strip?.height ?? 0)),
    ).toBeLessThan(48);
  });

  test('is absent from an invoice that replaces nothing and was replaced by nothing', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-m1');

    await expect(invoice.replaces()).toHaveCount(0);
    await expect(invoice.replacedBy()).toHaveCount(0);
    await expect(invoice.summary()).not.toContainText('Replaces');
    await expect(invoice.summary()).not.toContainText('Replaced by');
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

test.describe('the layout of the page', () => {
  /** The boxes of the cards of the row, and of the lines card under it. */
  async function boxes(invoice: InvoiceDetailDriver) {
    // The handoff is not on every invoice, and a box of what is not there would wait.
    const hasHandoff = (await invoice.handoff().count()) > 0;
    const [summary, billedTo, handoff, lines] = await Promise.all([
      invoice.summary().boundingBox(),
      invoice.identity().boundingBox(),
      hasHandoff ? invoice.handoff().boundingBox() : null,
      invoice.linesCard().boundingBox(),
    ]);
    expect(summary).not.toBeNull();
    expect(billedTo).not.toBeNull();
    expect(lines).not.toBeNull();

    return {
      billedTo: billedTo!,
      handoff,
      lines: lines!,
      summary: summary!,
    };
  }

  test('holds the summary, who it is billed to and the handoff in one row aligned at the top, with the lines across the page under it', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');
    const { billedTo, handoff, lines, summary } = await boxes(invoice);

    // One row, from the same top; each card ends with its content.
    expect(handoff).not.toBeNull();
    expect(billedTo.y).toBeCloseTo(summary.y, 0);
    expect(handoff!.y).toBeCloseTo(summary.y, 0);
    const rowBottom = Math.max(
      ...[summary, billedTo, handoff!].map((box) => box.y + box.height),
    );
    // Side by side, in the order of the page.
    expect(billedTo.x).toBeGreaterThan(summary.x + summary.width - 1);
    expect(handoff!.x).toBeGreaterThan(billedTo.x + billedTo.width - 1);
    // The lines start under the row and run across all of it.
    expect(lines.y).toBeGreaterThan(rowBottom);
    expect(lines.x).toBeCloseTo(summary.x, 0);
    expect(lines.x + lines.width).toBeCloseTo(handoff!.x + handoff!.width, 0);
  });

  test('holds the two cards that remain, side by side and of one width, when the invoice is in no queue', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-h1');
    await expect(invoice.handoff()).toHaveCount(0);
    const { billedTo, lines, summary } = await boxes(invoice);

    expect(billedTo.y).toBeCloseTo(summary.y, 0);
    expect(billedTo.width).toBeCloseTo(summary.width, 0);
    // The row is the width of the page: the two cards share it, nothing is left empty.
    expect(lines.x + lines.width).toBeCloseTo(billedTo.x + billedTo.width, 0);
  });

  test('gives the handoff the whole width of a row of its own, between a laptop and a tablet', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());
    await page.setViewportSize({ height: 800, width: 1100 });

    await invoice.goto('inv-p1');
    const { billedTo, handoff, summary } = await boxes(invoice);

    expect(billedTo.y).toBeCloseTo(summary.y, 0);
    expect(handoff!.y).toBeGreaterThan(
      Math.max(summary.y + summary.height, billedTo.y + billedTo.height),
    );
    expect(handoff!.x).toBeCloseTo(summary.x, 0);
    expect(handoff!.x + handoff!.width).toBeCloseTo(
      billedTo.x + billedTo.width,
      0,
    );
  });

  test('stacks the cards in one column on a narrow screen, with nothing wider than the screen', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());
    await page.setViewportSize({ height: 900, width: 700 });

    await invoice.goto('inv-p1');
    const { billedTo, handoff, lines, summary } = await boxes(invoice);

    expect(billedTo.x).toBeCloseTo(summary.x, 0);
    expect(handoff!.x).toBeCloseTo(summary.x, 0);
    expect(billedTo.y).toBeGreaterThan(summary.y + summary.height);
    expect(handoff!.y).toBeGreaterThan(billedTo.y + billedTo.height);
    expect(lines.width).toBeCloseTo(summary.width, 0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('puts the figures two abreast with the period under them on a tablet, and in one row of three from a laptop', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());
    await page.setViewportSize({ height: 1000, width: 820 });

    await invoice.goto('inv-p1');
    let [total, due, period] = await Promise.all([
      invoice.stat('Total').boundingBox(),
      invoice.stat('Due').boundingBox(),
      invoice.stat('Service period').boundingBox(),
    ]);
    expect(due?.y).toBeCloseTo(total?.y ?? 0, 0);
    expect(period?.y).toBeGreaterThan((total?.y ?? 0) + (total?.height ?? 0));
    expect(period?.x).toBeCloseTo(total?.x ?? 0, 0);
    expect((period?.x ?? 0) + (period?.width ?? 0)).toBeCloseTo(
      (due?.x ?? 0) + (due?.width ?? 0),
      0,
    );
    // Two months on one line, with their zone.
    await expect(invoice.stat('Service period')).toContainText(
      /Mar 1 – May 1, 2026\s*\(UTC\)/,
    );

    await page.setViewportSize({ height: 900, width: 1440 });
    [total, due, period] = await Promise.all([
      invoice.stat('Total').boundingBox(),
      invoice.stat('Due').boundingBox(),
      invoice.stat('Service period').boundingBox(),
    ]);
    expect(due?.y).toBeCloseTo(total?.y ?? 0, 0);
    expect(period?.y).toBeCloseTo(total?.y ?? 0, 0);
    expect(due?.x).toBeGreaterThan((total?.x ?? 0) + (total?.width ?? 0) - 1);
    expect(period?.x).toBeGreaterThan((due?.x ?? 0) + (due?.width ?? 0) - 1);
  });

  test('ends the totals where the column of amounts does, across the whole width of the lines', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');

    const amount = await invoice
      .line('Pro, monthly')
      .getByText('$29.00', { exact: true })
      .boundingBox();
    const total = await invoice
      .totals()
      .getByTestId('invoice-totals')
      .getByText('$27.39', { exact: true })
      .boundingBox();
    expect(amount).not.toBeNull();
    expect(total).not.toBeNull();
    expect((total?.x ?? 0) + (total?.width ?? 0)).toBeCloseTo(
      (amount?.x ?? 0) + (amount?.width ?? 0),
      0,
    );
  });

  test('keeps the header and the figures in place while the cards and the lines scroll under them', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());
    // Short enough for the lines to run past the screen.
    await page.setViewportSize({ height: 600, width: 1280 });

    await invoice.goto('inv-p1');
    const title = await invoice.title().boundingBox();
    const figure = await invoice.stat('Total').boundingBox();
    const summary = await invoice.summary().boundingBox();
    expect(summary?.y).toBeGreaterThan(
      (figure?.y ?? 0) + (figure?.height ?? 0),
    );

    await invoice.linesCard().hover();
    await page.mouse.wheel(0, 2000);

    // The cards left the screen by the top of what scrolls, and the figures did not.
    await expect(invoice.summary()).not.toBeInViewport();
    await expect(invoice.linesCard()).toBeInViewport();
    await expect(invoice.title()).toBeInViewport();
    await expect(invoice.stat('Total')).toBeInViewport();
    expect((await invoice.title().boundingBox())?.y).toBeCloseTo(
      title?.y ?? 0,
      0,
    );
    expect((await invoice.stat('Total').boundingBox())?.y).toBeCloseTo(
      figure?.y ?? 0,
      0,
    );
  });

  test('keeps a held draft’s banner under the strip and above the cards', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-h1');

    const figure = await invoice.stat('Total').boundingBox();
    const banner = await invoice.holdBanner().boundingBox();
    const summary = await invoice.summary().boundingBox();
    expect(banner?.y).toBeGreaterThan((figure?.y ?? 0) + (figure?.height ?? 0));
    expect(summary?.y).toBeGreaterThan(
      (banner?.y ?? 0) + (banner?.height ?? 0),
    );
    // The banner has the width of the page, as an alert does.
    expect(banner?.x).toBeCloseTo(summary?.x ?? 0, 0);
  });
});
