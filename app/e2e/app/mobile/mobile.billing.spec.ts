import { devices, type Locator } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import {
  expectNoHorizontalScroll,
  expectScrollsInside,
} from '../_support/assertions/layout';
import { BillingHandoffDriver } from '../_support/drivers/billing-handoff.driver';
import { BillingInvoicesDriver } from '../_support/drivers/billing-invoices.driver';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { LineDrilldownDriver } from '../_support/drivers/line-drilldown.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { createInvoicesModel } from '../billing/billing.scenarios';

// The narrowest phone billing is checked at: narrower than the Pixel 5, which
// the rest of the mobile suite uses.
const WIDTH = 375;

test.use({ ...devices['Pixel 5'], viewport: { height: 812, width: WIDTH } });

/** The dialog is wholly on the screen: neither of its sides is cut off. */
async function expectWithinScreen(dialog: Locator) {
  const box = await dialog.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(WIDTH);
}

test.describe('the invoices, on the narrowest phone', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createInvoicesModel());
  });

  test('the list keeps the width of the screen, its table scrolling inside its container', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);

    await list.goto();
    await expect(list.rows()).toHaveCount(10);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectScrollsInside(page.getByRole('table').first());
  });

  test('the list keeps its filters, its export and its paging within the screen', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);

    await list.goto('?customerSlug=initech');
    await list.addFilter('Kind');
    // The editor of the filter opens on the field that was picked.
    await expectWithinScreen(page.getByRole('dialog').last());
    await list.pick('Renewal');
    await expect(list.chips()).toHaveCount(2);

    await expectNoHorizontalScroll(page, WIDTH);
    await list.exportButton().click();
    await expectWithinScreen(page.getByRole('menu'));
  });

  test('an invoice keeps the width of the screen, and folds its actions into one menu', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);

    await invoice.goto('inv-m1');

    await expectNoHorizontalScroll(page, WIDTH);
    // Three buttons do not fit beside a title on a phone: they are one menu.
    await expect(invoice.actions()).toBeHidden();
    await expect(invoice.menu()).toBeVisible();
    await invoice.menu().click();
    await expect(
      page.getByRole('menuitem', { name: 'Mark as paid' }),
    ).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: 'Write off' }),
    ).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Void' })).toBeVisible();
    await expectWithinScreen(page.getByRole('menu'));
  });

  test('an action chosen from the menu opens its dialog within the screen', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);

    await invoice.goto('inv-m1');
    await invoice.menu().click();
    await page.getByRole('menuitem', { name: 'Write off' }).click();

    await expect(invoice.dialog()).toBeVisible();
    await expectWithinScreen(invoice.dialog());
    await expectNoHorizontalScroll(page, WIDTH);
    await invoice.reason().fill('customer bankrupt');
    await expect(invoice.confirm('Write off')).toBeEnabled();
  });

  test('the lines of an invoice, with what stands behind them, stay on the screen', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);

    await invoice.goto('inv-p1');
    await expect(invoice.lines()).toHaveCount(3);

    await expectNoHorizontalScroll(page, WIDTH);
    // The page hides what runs past it: a card wider than the screen would lose the
    // amounts at its edge without the page scrolling to say so. The table scrolls
    // inside the card instead.
    await expectWithinScreen(invoice.linesCard());
    await expectScrollsInside(invoice.linesCard().getByRole('table'));
    await expect(invoice.fingerprint('Traces overage')).toBeVisible();
    await expect(invoice.reportsLink('Traces overage')).toBeVisible();
  });

  test('a held draft, with its banner, keeps the width of the screen', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);

    await invoice.goto('inv-h2');
    await expect(invoice.holdBanner()).toBeVisible();

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(invoice.holdBanner());
    await expectWithinScreen(invoice.linesCard());
  });

  test('the reports behind a line scroll inside their card, and a way back is on the screen', async ({
    page,
  }) => {
    const drilldown = new LineDrilldownDriver(page);

    await drilldown.goto('inv-p1', 'inv-p1-line-1', 'Traces overage');
    await expect(drilldown.reportRows()).toHaveCount(5);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectScrollsInside(drilldown.window(0).getByRole('table'));
    // The trail shows only the level above, which is no page: the way back is a button.
    await expect(drilldown.backToInvoice()).toBeVisible();
    await drilldown.backToInvoice().click();
    await expect(page).toHaveURL(/\/billing\/invoices\/inv-p1$/);
  });

  test('the handoff queue keeps the width of the screen, and its dialog fits', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);

    await handoff.goto();
    await expect(handoff.rows()).toHaveCount(4);

    await expectNoHorizontalScroll(page, WIDTH);
    await handoff.acknowledgeButton('inv-p1').scrollIntoViewIfNeeded();
    await handoff.acknowledgeButton('inv-p1').click();
    await expect(handoff.dialog()).toBeVisible();
    await expectWithinScreen(handoff.dialog());
    await expectNoHorizontalScroll(page, WIDTH);
  });
});
