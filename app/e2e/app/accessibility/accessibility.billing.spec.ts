import { expect, test } from '../_support/app-test';
import {
  expectDialogAccessible,
  expectNoAccessibilityViolations,
  settle,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { expectFocusTrapped } from '../_support/assertions/focus';
import { BillingHandoffDriver } from '../_support/drivers/billing-handoff.driver';
import { BillingInvoicesDriver } from '../_support/drivers/billing-invoices.driver';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { LineDrilldownDriver } from '../_support/drivers/line-drilldown.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import {
  createEmptyInvoicesModel,
  createInvoicesModel,
} from '../billing/billing.scenarios';

// The screens of the invoices as a person who cannot use a mouse or a screen
// meets them: no violation on the page, status read in words and never in colour
// alone, each dialog keeping the focus inside while it is open and closing on
// Escape.

test.describe('accessibility of the invoices of the organization', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createInvoicesModel({ stripe: true }));
  });

  test('the list has no WCAG A/AA violations, in either theme', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);

    await list.gotoShowingEverything();
    await expect(list.rows()).toHaveCount(13);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('every status says what it is in words, never by its colour alone', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);

    await list.gotoShowingEverything();
    await expect(list.rows()).toHaveCount(13);

    const statuses = await list.statusBadges().allTextContents();
    expect(statuses.length).toBeGreaterThan(10);
    for (const status of statuses) {
      expect(
        status.trim().length,
        'a status badge with no text',
      ).toBeGreaterThan(0);
    }
    expect(new Set(statuses.map((status) => status.trim()))).toEqual(
      new Set([
        'Held',
        'Overdue',
        'Ready to bill',
        'Paid',
        'Written off',
        'Void',
        'Awaiting payment',
        'Push failed',
      ]),
    );
  });

  test('the Filter menu has no violations and closes on Escape, nor has the list once it is filtered and scoped', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);

    await list.goto('?customerSlug=initech');
    await page.getByRole('button', { exact: true, name: 'Filter' }).click();
    await expect(page.getByRole('option', { name: 'Status' })).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // A filter and the scope are chips: each says what it is, and has a button
    // that takes it off.
    await list.addFilter('Issued');
    await list.pickDay('Issued', '2026-03-01');
    await list.closeEditor();
    await list.expectChips(['Customer: initech', 'Issued is 2026-03-01']);
    await expectNoAccessibilityViolations(page);
  });

  test('the editors of the filters have none, whether they pick several choices, one, or yes or no', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);

    await list.gotoShowingEverything();

    // Several choices: each is a check, and the list stays open for the next.
    await list.addFilter('Status');
    await list.pick('Ready to bill');
    await settle(page);
    await expectNoAccessibilityViolations(page);
    await list.closeEditor();

    // One choice, or all.
    await list.addFilter('Kind');
    await settle(page);
    await expectNoAccessibilityViolations(page);
    await list.closeEditor();

    // Yes or no.
    await list.addFilter('Overdue');
    await settle(page);
    await expectNoAccessibilityViolations(page);
    await list.closeEditor();
  });

  test('the export menu is a menu a keyboard reaches and leaves', async ({
    page,
  }) => {
    const list = new BillingInvoicesDriver(page);

    await list.goto();
    await list.exportButton().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(list.exportButton()).toBeFocused();
  });

  test('the empty list has no violations', async ({ page }) => {
    const list = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createEmptyInvoicesModel());

    await list.goto('?customerSlug=nobody');
    await expect(list.empty()).toBeVisible();

    await expectNoAccessibilityViolations(page);
  });
});

test.describe('accessibility of an invoice', () => {
  // A spec that needs the API to fail installs its own model: the first one
  // installed on a page is the one it keeps.
  test.beforeEach(async ({ page }, testInfo) => {
    if (!testInfo.title.includes('refusal is announced')) {
      await installBillingAppMocks(page, createInvoicesModel());
    }
  });

  test('has no WCAG A/AA violations, in either theme', async ({ page }) => {
    const invoice = new InvoiceDetailDriver(page);

    await invoice.goto('inv-p1');
    await expect(invoice.lines()).toHaveCount(3);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('a held draft, with its banner and the meters that failed, has none either', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);

    await invoice.goto('inv-h1');
    await expect(invoice.holdBanner()).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('a void invoice with its chain and a paid one with its handoff have none', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);

    await invoice.goto('inv-v1');
    await expect(invoice.chain()).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await invoice.goto('inv-d1');
    await expect(invoice.handoff()).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('the dialog that releases a hold is accessible', async ({ page }) => {
    const invoice = new InvoiceDetailDriver(page);

    await invoice.goto('inv-h1');
    await invoice.action('Release the hold').click();
    await expect(invoice.dialog()).toBeVisible();
    await expect(invoice.reason()).toBeVisible();

    await expectDialogAccessible(page, invoice.dialog());
  });

  test('the dialog that marks an invoice paid is accessible', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);

    await invoice.goto('inv-m1');
    await invoice.action('Mark as paid').click();
    await expect(invoice.dialog()).toBeVisible();
    await expect(
      invoice.dialog().getByLabel('External reference'),
    ).toBeVisible();

    await expectDialogAccessible(page, invoice.dialog());
  });

  test('the dialogs that write an invoice off and void it are accessible', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);

    await invoice.goto('inv-m1');
    await invoice.action('Write off').click();
    await expect(invoice.reason()).toBeVisible();
    await expectDialogAccessible(page, invoice.dialog());

    await invoice.action('Void').click();
    await expect(invoice.reason()).toBeVisible();
    await expectDialogAccessible(page, invoice.dialog());
  });

  test('the confirmation of a recompose is accessible', async ({ page }) => {
    const invoice = new InvoiceDetailDriver(page);

    await invoice.goto('inv-h2');
    await invoice.action('Recompose').click();
    await expect(invoice.alertDialog()).toBeVisible();

    await expectDialogAccessible(page, invoice.alertDialog());
  });

  test('the dialog with an error in it is accessible: the refusal is announced', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const model = createInvoicesModel();
    model.invoices.armProblem('writeOff', {
      detail: 'the invoice store is unavailable',
      status: 500,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-m1');
    await invoice.action('Write off').click();
    await invoice.confirmWithReason('Write off', 'customer bankrupt');
    await expect(invoice.dialog().getByRole('alert')).toContainText(
      'the invoice store is unavailable',
    );

    await expectDialogAccessible(page, invoice.dialog());
  });
});

test.describe('accessibility of the reports behind a line', () => {
  test('has no WCAG A/AA violations, in either theme', async ({ page }) => {
    const drilldown = new LineDrilldownDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await drilldown.goto('inv-p1', 'inv-p1-line-1', 'Traces overage');
    await expect(drilldown.reportRows()).toHaveCount(5);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the notice for reports that are no longer kept has none', async ({
    page,
  }) => {
    const drilldown = new LineDrilldownDriver(page);
    await installBillingAppMocks(
      page,
      createInvoicesModel({ retentionStart: '2026-04-01T00:00:00.000Z' }),
    );

    await drilldown.goto('inv-p1', 'inv-p1-line-1', 'Traces overage');
    await expect(drilldown.outsideRetention()).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('the properties of a report open in an accessible dialog', async ({
    page,
  }) => {
    const drilldown = new LineDrilldownDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await drilldown.goto('inv-p1', 'inv-p1-line-1', 'Traces overage');
    await page
      .getByRole('button', { name: 'Show the properties of report 41' })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('"region": "eu-west-1"');

    await expectDialogAccessible(page, dialog);
  });
});

test.describe('accessibility of the handoff queue', () => {
  test('has no WCAG A/AA violations, in either theme, on both tabs', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await expect(handoff.rows()).toHaveCount(4);
    await expectNoAccessibilityViolations(page);
    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);

    await handoff.showTab('Acknowledged');
    await expect(handoff.rows()).toHaveCount(3);
    await expectNoAccessibilityViolations(page);
  });

  test('the empty queue, with its command, has none', async ({ page }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createEmptyInvoicesModel());

    await handoff.goto();
    await expect(handoff.empty()).toBeVisible();

    await expectNoAccessibilityViolations(page);
  });

  test('the tabs are reached and changed with the keyboard', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.tab('Waiting').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');

    await expect(handoff.tab('Acknowledged')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('the dialog that acknowledges an invoice is accessible', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.acknowledgeButton('inv-p1').click();
    await expect(handoff.dialog()).toBeVisible();
    await expect(handoff.reference()).toBeVisible();

    await settle(page);
    await expectNoAccessibilityViolations(page);
    await expectFocusTrapped(page, handoff.dialog());
    await page.keyboard.press('Escape');
    await expect(handoff.dialog()).toHaveCount(0);
  });
});
