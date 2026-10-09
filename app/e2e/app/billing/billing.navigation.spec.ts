import { expect, test } from '../_support/app-test';
import { BillingNavDriver } from '../_support/drivers/billing-nav.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import {
  createBillingDisabledModel,
  createBillingFeatureGatedModel,
  createBillingFullModel,
  createBillingStackModel,
  createInvoicesModel,
} from './billing.scenarios';

// The two receipts of lucide: the one with a dollar sign draws the area, the one
// with lines of text draws an invoice. `lucide-receipt` alone, not its sibling.
const RECEIPT = /(^|\s)lucide-receipt(\s|$)/;
const RECEIPT_TEXT = /(^|\s)lucide-receipt-text(\s|$)/;

// The billing entries of the side navigation follow what the capabilities say:
// the Invoices entry is there where billing is on, and the Billing section holds
// the rest, entry by entry for what the release ships. Where they are not there,
// a link to a billing page explains why: see `billing.unavailable.spec.ts`.

test.describe('the billing entries of the navigation', () => {
  test('is left out where billing is off on the deployment', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );

    await nav.gotoShell();

    await nav.expectNoSection();
  });

  test('is left out where the plan does not include billing', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('NOT_ENTITLED'),
    );

    await nav.gotoShell();

    await nav.expectNoSection();
  });

  test('lists the invoices on their own, and the handoff queue in the section, where billing is on', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingStackModel());

    await nav.gotoShell();
    // The invoices are an entry of the navigation, not of the section: they are
    // there before the section is opened.
    await expect(nav.entry('Invoices')).toBeVisible();
    await expect(nav.entry('Handoff')).toHaveCount(0);
    await nav.open();

    await nav.expectEntries(['Handoff']);
    await expect(nav.entry('Add-ons')).toHaveCount(0);
    await expect(nav.entry('Vouchers')).toHaveCount(0);
  });

  test('hides the entries of the parts the release does not ship', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingFeatureGatedModel());

    await nav.gotoShell();
    await nav.open();

    await nav.expectEntries(['Invoices', 'Handoff']);
    await expect(nav.entry('Add-ons')).toHaveCount(0);
    await expect(nav.entry('Vouchers')).toHaveCount(0);
  });

  test('lists every entry when every part is shipped', async ({ page }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingFullModel());

    await nav.gotoShell();
    await nav.open();

    await nav.expectEntries(['Invoices', 'Handoff', 'Add-ons', 'Vouchers']);
    await expect(nav.entry('Invoices')).toHaveAttribute('href', '/invoices');
    await expect(nav.entry('Add-ons')).toHaveAttribute('href', '/addons');
  });

  test('opens the section by itself on a page of it', async ({ page }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingStackModel());

    await page.goto('/billing/handoff');

    await expect(nav.section()).toHaveAttribute('aria-expanded', 'true');
    await nav.expectEntries(['Handoff']);
    // Billing is on, so no explanation stands in for the page.
    await expect(nav.unavailable()).toHaveCount(0);
  });

  test('marks the Invoices entry as the current one on an invoice', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await page.goto('/invoices/inv-m1');

    await expect(nav.entry('Invoices')).toHaveAttribute('aria-current', 'page');
    // The invoices are not in the section, which stays closed.
    await expect(nav.section()).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('the icons of billing', () => {
  test('draws the Billing section with the receipt of the area, and not with the one of an invoice', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingStackModel());

    await nav.gotoShell();

    await expect(nav.sectionIcon()).toHaveClass(RECEIPT);
    await expect(nav.sectionIcon()).not.toHaveClass(RECEIPT_TEXT);
  });

  for (const [path, what] of [
    ['/invoices', 'the list of the invoices'],
    ['/billing/handoff', 'the handoff queue'],
    ['/invoices/inv-m1', 'one invoice'],
  ] as const) {
    test(`draws an invoice with the receipt with its lines in the header of ${what}`, async ({
      page,
    }) => {
      await installBillingAppMocks(page, createInvoicesModel());

      await page.goto(path);

      await expect(
        page.getByRole('main').getByRole('heading', { level: 1 }),
      ).toBeVisible();
      await expect(
        page.getByRole('main').locator('svg.lucide-receipt-text').first(),
      ).toBeVisible();
      await expect(
        page.getByRole('main').locator('svg.lucide-receipt'),
      ).toHaveCount(0);
    });
  }
});
