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

// The Billing section of the side navigation follows what the capabilities say:
// it is there where billing is on, and entry by entry for what the release
// ships. Where it is not there, a link to a billing page explains why: see
// `billing.unavailable.spec.ts`.

test.describe('the Billing section of the navigation', () => {
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

  test('lists the invoices and the handoff queue where billing is on, and nothing more', async ({
    page,
  }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingStackModel());

    await nav.gotoShell();
    await nav.open();

    await nav.expectEntries(['Invoices', 'Handoff']);
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
    await expect(nav.entry('Invoices')).toHaveAttribute(
      'href',
      '/billing/invoices',
    );
    await expect(nav.entry('Add-ons')).toHaveAttribute('href', '/addons');
  });

  test('opens by itself on a billing page', async ({ page }) => {
    const nav = new BillingNavDriver(page);
    await installBillingAppMocks(page, createBillingStackModel());

    await page.goto('/billing/invoices');

    await expect(nav.section()).toHaveAttribute('aria-expanded', 'true');
    await nav.expectEntries(['Invoices', 'Handoff']);
    // Billing is on, so no explanation stands in for the page.
    await expect(nav.unavailable()).toHaveCount(0);
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
    ['/billing/invoices', 'the list of the invoices'],
    ['/billing/handoff', 'the handoff queue'],
    ['/billing/invoices/inv-m1', 'one invoice'],
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
