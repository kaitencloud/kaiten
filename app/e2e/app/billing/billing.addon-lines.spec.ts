import { expect, recordWrites, test } from '../_support/app-test';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { LineDrilldownDriver } from '../_support/drivers/line-drilldown.driver';
import { startInLanguage } from '../_support/language';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { signInWithScopes } from '../_support/session-scopes';
import { ADDON_INVOICE_ID } from './addon-lines';
import { createAddonLinesModel } from './billing.scenarios';

// What the add-ons of an instance put on an invoice: the fee of an add-on, and the usage
// it rated, are billed over the window the add-on was held and not over the period of the
// subscription, and an add-on removed before the boundary is still on the invoice. The
// usage an add-on rated has no license price, so nothing in its line says whose it is but
// the attachment it names: the console finds the add-on there, among everything the
// instance has held.

const ADDONS = /^\/api\/instances\/acme-production\/addons$/;

test.describe('the add-on lines of an invoice', () => {
  test('lists them in the order of the API, each over the window the add-on was held', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createAddonLinesModel());

    await invoice.goto(ADDON_INVOICE_ID);

    await expect(invoice.lines()).toHaveCount(5);
    const [priority, tokens, base, seats, discount] = await invoice
      .lines()
      .all();
    // Removed on September 10th at 9:30, before the boundary of the 15th: billed in full,
    // over the window it was held, which is not the period of the subscription.
    await expect(priority).toContainText('Priority pack × 1');
    await expect(priority).toContainText('Add-on');
    await expect(priority).toContainText(
      'Aug 20, 2026, 12:00 AM – Sep 10, 2026, 9:30 AM (UTC)',
    );
    await expect(priority).toContainText('$50.00');
    // Attached on August 28th, in the middle of the period it is billed for.
    await expect(tokens).toContainText('Tokens');
    await expect(tokens).toContainText('Usage');
    await expect(tokens).toContainText('Aug 28 – Sep 15, 2026 (UTC)');
    await expect(tokens).toContainText('$8.40');
    await expect(base).toContainText('Sep 15 – Oct 15, 2026 (UTC)');
    await expect(seats).toContainText('Extra seats × 3');
    await expect(seats).toContainText('Sep 15 – Oct 15, 2026 (UTC)');
    await expect(discount).toContainText('−$8.84');
  });

  test('names the add-on a usage line was rated for, and the one that was removed since', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createAddonLinesModel());
    const reads = recordWrites(page, ADDONS, ['GET']);

    await invoice.goto(ADDON_INVOICE_ID);

    await expect(
      invoice.line('Tokens').getByTestId('invoice-line-addon'),
    ).toHaveText('From the add-on Extra tokens');
    // The attachment is not in the plain list of the instance's add-ons any more: it is
    // found among all it has held.
    await expect(
      invoice.line('Priority pack × 1').getByTestId('invoice-line-addon'),
    ).toHaveText(
      'From the add-on Priority pack, removed on Sep 10, 2026, 9:30 AM (UTC)',
    );
    // A fee of an add-on that is still held says nothing more than its label does.
    await expect(
      invoice.line('Extra seats × 3').getByTestId('invoice-line-addon'),
    ).toHaveCount(0);
    // One read for every line, with the attachments that were taken off.
    expect(reads.map(({ search }) => search)).toEqual(['?includeRemoved=true']);
  });

  test('shows a discount of the add-ons bearing on the fees and on the usage of the add-ons', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createAddonLinesModel());

    await invoice.goto(ADDON_INVOICE_ID);

    const discount = invoice.line('ADDONS −10%');
    await expect(discount.getByTestId('invoice-line-discount')).toContainText(
      'Bears on Priority pack × 1 ($5.00), Tokens ($0.84), and Extra seats × 3 ($3.00)',
    );
  });

  test('leads from the usage of an add-on to the reports it was measured from, over the window it was held', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const drilldown = new LineDrilldownDriver(page);
    await installBillingAppMocks(page, createAddonLinesModel());

    await invoice.goto(ADDON_INVOICE_ID);
    // The fee of an add-on was not measured from anything: no way to reports.
    await expect(invoice.reportsLink('Priority pack × 1')).toHaveCount(0);
    await invoice.reportsLink('Tokens').click();

    await expect(page).toHaveURL(
      new RegExp(
        `/invoices/${ADDON_INVOICE_ID}/lines/${ADDON_INVOICE_ID}-line-2$`,
      ),
    );
    await expect(drilldown.summary()).toContainText(
      'Aug 28 – Sep 15, 2026 (UTC)',
    );
    // Whose window it is.
    await expect(drilldown.summary().getByTestId('line-addon')).toHaveText(
      'Extra tokens',
    );
    await expect(drilldown.measuredQuantity()).toHaveText('4,200,000');
    await expect(drilldown.billedQuantity()).toHaveText('4.2');
    await expect(drilldown.fingerprint()).toHaveText(
      'Reports 11–13 · 3 rows · Σ 4,200,000',
    );
    // The line spans two calendar months: one window each, 1.5M and 2.7M.
    await expect(drilldown.windows()).toHaveCount(2);
    await expect(drilldown.windowSum(0)).toHaveText(
      '1 report · usage 1,500,000',
    );
    await expect(drilldown.windowSum(1)).toHaveText(
      '2 reports · usage 2,700,000',
    );
  });

  test('says only that a line comes from an add-on to a session that may not list the add-ons of an instance', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await signInWithScopes(page, ['read:billing']);
    await installBillingAppMocks(page, createAddonLinesModel());
    const reads = recordWrites(page, ADDONS, ['GET']);

    await invoice.goto(ADDON_INVOICE_ID);

    await expect(
      invoice.line('Tokens').getByTestId('invoice-line-addon'),
    ).toHaveText('From an add-on');
    // Nothing was asked of the API that it would refuse.
    expect(reads).toEqual([]);
  });

  test('reads the add-on of a line in French', async ({ page }) => {
    await startInLanguage(page, 'fr');
    await installBillingAppMocks(page, createAddonLinesModel());

    await page.goto(`/invoices/${ADDON_INVOICE_ID}`);

    const noteOf = (label: string) =>
      page
        .getByRole('row')
        .filter({ hasText: label })
        .getByTestId('invoice-line-addon');
    await expect(noteOf('Tokens')).toHaveText(
      'Provient de l’add-on Extra tokens',
    );
    await expect(noteOf('Priority pack × 1')).toContainText(
      'Provient de l’add-on Priority pack, retiré le',
    );
  });
});
